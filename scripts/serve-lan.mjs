/**
 * Serves the built app (dist/) over HTTPS on the local network so an iPhone
 * can install it: Safari requires a secure context for the service worker
 * and "Add to Home Screen".
 *
 * A self-signed certificate is generated for the machine's LAN addresses and
 * reused across runs (regenerated automatically if the address set changes).
 * Trust it once on the phone — see the instructions printed at startup.
 *
 * Usage: node scripts/serve-lan.mjs [port]   (default port 4174)
 */
import { createReadStream, existsSync } from "node:fs"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:https"
import { extname, join, resolve, sep } from "node:path"
import { networkInterfaces } from "node:os"
import process from "node:process"
import selfsigned from "selfsigned"

const DIST = resolve("dist")
const CERT_DIR = resolve(".cache", "lan-cert")
const PORT = Number(process.argv[2] ?? 4174)

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
}

/** The IPv4 LAN addresses (plus localhost) the certificate must name. */
function lanIps() {
  const addresses = new Set()
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.add(entry.address)
    }
  }
  return [...addresses]
}

const sanNames = (ips) => [{ type: 2, value: "localhost" }, ...ips.map((ip) => ({ type: 7, ip }))]

async function loadCertificate() {
  await mkdir(CERT_DIR, { recursive: true })
  const keyPath = join(CERT_DIR, "key.pem")
  const certPath = join(CERT_DIR, "cert.pem")
  const metaPath = join(CERT_DIR, "meta.json")
  const wanted = sanNames(lanIps())
  if (existsSync(keyPath) && existsSync(certPath)) {
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8"))
      if (JSON.stringify(meta) === JSON.stringify(wanted)) {
        return {
          key: await readFile(keyPath, "utf8"),
          cert: await readFile(certPath, "utf8"),
        }
      }
    } catch {
      // A stale or unreadable pair: regenerate below.
    }
  }
  const addresses = wanted.map((entry) => (entry.type === 2 ? entry.value : entry.ip))
  console.log(`Generating a self-signed certificate for: ${addresses.join(", ")}`)
  const pems = await selfsigned.generate([{ name: "commonName", value: "QuranMemoriser LAN" }], {
    algorithm: "sha256",
    notAfterDate: new Date(Date.now() + 825 * 86400 * 1000),
    extensions: [{ name: "subjectAltName", altNames: wanted }],
  })
  await writeFile(keyPath, pems.private)
  await writeFile(certPath, pems.cert)
  await writeFile(metaPath, JSON.stringify(wanted))
  return { key: pems.private, cert: pems.cert }
}

if (!existsSync(join(DIST, "index.html"))) {
  console.error("dist/ is missing — run: npx.cmd vite build")
  process.exit(1)
}

const tls = await loadCertificate()

const server = createServer(tls, async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end()
    return
  }
  const url = new URL(request.url ?? "/", "https://lan.local")
  let pathname = decodeURIComponent(url.pathname)
  if (pathname.endsWith("/")) pathname += "index.html"
  let file = resolve(join(DIST, `.${pathname}`))
  // Stay inside dist/, then fall back to the single-page entry.
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    response.writeHead(403).end()
    return
  }
  const info = await stat(file).catch(() => null)
  if (!info || info.isDirectory()) {
    file = join(DIST, "index.html")
  }
  const data = await stat(file).catch(() => null)
  if (!data) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": data.size,
  })
  if (request.method === "HEAD") {
    response.end()
    return
  }
  createReadStream(file).on("error", () => response.destroy()).pipe(response)
})

server.listen(PORT, "0.0.0.0", () => {
  const addresses = lanIps()
  console.log("")
  console.log("QuranMemoriser serving dist/ over HTTPS")
  console.log("")
  for (const address of addresses) {
    console.log(`  On the iPhone (same Wi-Fi):  https://${address}:${PORT}/`)
  }
  console.log(`  On this PC:                  https://localhost:${PORT}/`)
  console.log("")
  console.log("First time on the iPhone — trust the certificate (one minute):")
  console.log(`  1. Send ${join(CERT_DIR, "cert.pem")} to the phone`)
  console.log("     (AirDrop it, or email it to yourself and tap the attachment).")
  console.log("  2. iOS offers 'Profile Downloaded': Settings > Install, then Done.")
  console.log("  3. Settings > General > About > Certificate Trust Settings >")
  console.log("     switch ON the 'QuranMemoriser LAN' profile.")
  console.log("  4. Reopen the site: no warning now. Share > Add to Home Screen.")
  console.log("")
  console.log("Quick look without trusting: open the URL and accept Safari's")
  console.log("warning ('Visit Website'). The app reads from the network but the")
  console.log("service worker and home-screen install stay disabled — trusting")
  console.log("the certificate is what unlocks install + offline.")
  console.log("")
  console.log("First visit precaches ~52 MB (all 604 page fonts + text): keep the")
  console.log("page open a little while, then airplane-mode works.")
  console.log("")
})
