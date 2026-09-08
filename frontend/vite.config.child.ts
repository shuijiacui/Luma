import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 儿童端 App：保持网页版，独立端口 5175
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_MODE__: JSON.stringify('child'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    proxy: {
      // 判定服务（server/，npm start → localhost:3001）
      '/api': 'http://localhost:3001',
    },
  },
})