import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Dev server proxies the API so the console runs same-origin (no CORS needed):
//   CARD_AGENT_API=http://127.0.0.1:8080 npm run dev
const target = process.env.CARD_AGENT_API ?? "http://127.0.0.1:8080"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    proxy: {
      "/v1": { target, changeOrigin: true },
      "/health": { target, changeOrigin: true },
      "/metrics": { target, changeOrigin: true },
      "/docs": { target, changeOrigin: true },
      "/openapi.json": { target, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "charts"
          if (id.includes("node_modules/@codemirror") || id.includes("node_modules/@uiw") || id.includes("node_modules/@lezer")) return "editor"
        },
      },
    },
  },
})
