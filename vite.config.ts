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
      // Additional reciter timing maps are loaded and cached on demand so
      // supporting more voices does not inflate the initial install.
      globIgnores: [
        "data/audio-timings/abdul-*.json",
        "data/audio-timings/hani-rifai.json",
        "data/audio-timings/husary*.json",
        "data/audio-timings/minshawy-mujawwad.json",
        "data/audio-timings/shaatree.json",
        "data/audio-timings/shuraym.json",
        "data/audio-timings/tablaway.json",
      ],
      disable: process.env.VITEST === "true",
    }),
  ],
  build: {
    target: "es2022",
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
    passWithNoTests: true,
  },
})
