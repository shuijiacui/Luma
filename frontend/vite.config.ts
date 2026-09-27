import { voiceAssets } from './voice-assets'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // dev-all runs all three apps together; each needs its own dependency cache.
  cacheDir: 'node_modules/.vite/portal',
  plugins: [voiceAssets(),react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // 判定服务（server/，npm start → localhost:3001）
      '/api': 'http://localhost:3001',
    },
  },
})
