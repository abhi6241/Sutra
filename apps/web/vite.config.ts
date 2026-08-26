import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_URL = process.env.VITE_API_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __API_URL__: JSON.stringify(API_URL),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/chat': 'http://localhost:8000',
      '/approve': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/inbox': 'http://localhost:8000',
      '/calendar': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
      '/stream': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache, no-transform'
          })
        },
      },
    },
  },
})
