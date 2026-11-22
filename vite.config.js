import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // FastAPI backend (backend/, port 8000). Call it as fetch('/api/...');
    // ws: true also forwards the live-listening WebSocket (/api/live).
    proxy: { '/api': { target: 'http://127.0.0.1:8000', ws: true } },
    // The Python backend isn't part of the frontend build: don't reload pages when it changes.
    watch: { ignored: ['**/backend/**'] },
  },
})
