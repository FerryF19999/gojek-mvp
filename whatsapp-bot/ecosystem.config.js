module.exports = {
  apps: [{
    name: 'nemu-wa-bot',
    script: './index.js',
    cwd: __dirname,
    restart_delay: 5000,
    max_restarts: 10,
    env: {
      NEMU_API_BASE: 'https://gojek-mvp.vercel.app/api',
      NEMU_APP_URL: 'https://gojek-mvp.vercel.app',
      ADMIN_NUMBER: '6282120623389',
      BOT_PORT: 3001,
      CONVEX_URL: process.env.CONVEX_URL || 'https://YOUR_CONVEX_URL.convex.cloud'
    }
  }]
}
