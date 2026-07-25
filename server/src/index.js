// 入口：加载 server/.env（存在时），启动服务
try {
  process.loadEnvFile(new URL('../.env', import.meta.url))
} catch { /* .env 不存在时使用环境变量/默认值 */ }

const { createApp } = await import('./app.js')
const port = process.env.PORT || 3001
createApp().listen(port, () => console.log(`server listening on http://localhost:${port}`))
