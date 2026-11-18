import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    // Dev: forward API calls to the card-agent FastAPI service (CARD_AGENT_API=http://host:port npm run dev).
    proxy: {
      "/v1": { target: process.env.CARD_AGENT_API ?? "http://localhost:8080", changeOrigin: true },
      "/health": { target: process.env.CARD_AGENT_API ?? "http://localhost:8080", changeOrigin: true },
    },
  },
})
