module.exports = {
  apps: [
    {
      name: 'solana-server',
      script: 'server.js',
      watch: true,
      ignore_watch: ['node_modules', 'logs'],
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        MONGODB_URI: 'mongodb://localhost:27017/pump_tokens'
      },
      error_file: 'logs/server-err.log',
      out_file: 'logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'solana-monitor',
      script: 'getTokenInfo.js',
      watch: true,
      ignore_watch: ['node_modules', 'logs'],
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://localhost:27017/pump_tokens',
        http_proxy: 'socks5://127.0.0.1:10808',
        https_proxy: 'socks5://127.0.0.1:10808',
        all_proxy: 'socks5://127.0.0.1:10808'
      },
      error_file: 'logs/monitor-err.log',
      out_file: 'logs/monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}; 