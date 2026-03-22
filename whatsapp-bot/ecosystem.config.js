module.exports = {
  apps: [{
    name: 'nemu-wa-bot',
    script: './whatsapp-bot/index.js',
    cwd: '/root/.openclaw/workspace/friday/gojek-mvp',
    restart_delay: 5000,
    max_restarts: 10,
    env: {
      NEMU_API_BASE: 'https://gojek-mvp.vercel.app/api',
      ADMIN_NUMBER: '6282120623389'
    }
  }]
}
