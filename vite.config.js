import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// OpenClaw Gateway token for local dev proxy
// In production, set VITE_OPENCLAW_TOKEN + VITE_OPENCLAW_API_URL env vars instead
const OPENCLAW_TOKEN = '4f5de160effa366eca42a657f98b3264753e69fbd97e054a'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Proxy /openclaw/* → http://127.0.0.1:18789/* in local dev
      // This avoids CORS issues and keeps the token out of browser requests
      '/openclaw': {
        target: 'http://127.0.0.1:18789',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openclaw/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Authorization', `Bearer ${OPENCLAW_TOKEN}`)
          })
        },
      },
    },
  },
})
