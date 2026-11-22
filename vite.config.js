import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // FastAPI backend (backend/, port 8000). Call it as fetch('/api/...').
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
