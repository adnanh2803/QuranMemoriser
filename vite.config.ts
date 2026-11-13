import { serwist } from "@serwist/vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    serwist({
      swSrc: "src/lib/pwa/sw.ts",
      swDest: "sw.js",
      // Fonts, page data chunks and other static assets are precached so the
      // whole mushaf works offline from the first install.
      globDirectory: "dist",
      globPatterns: ["**/*.{js,css,html,svg,woff2,webmanifest,json,png}"],
      disable: process.env.VITEST === "true",
    }),
  ],
  build: {
    target: "es2022",
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: true,
  },
})
