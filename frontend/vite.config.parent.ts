import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 家长端 App：手机竖屏版，独立端口 5174
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_MODE__: JSON.stringify('parent'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      // 判定服务（server/，npm start → localhost:3001）
      '/api': 'http://localhost:3001',
    },
  },
})