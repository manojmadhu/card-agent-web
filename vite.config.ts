import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    // Point the platform at the card-agent FastAPI service during development.
    proxy: { "/v1": { target: process.env.CARD_AGENT_API ?? "http://localhost:8080", changeOrigin: true } },
  },
})
