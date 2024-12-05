module.exports = {
    apps: [
      {
        name: "token-server",
        script: "server.js",
        watch: true,
        ignore_watch: ["node_modules", "logs"],
        instances: 2,
        exec_mode: "fork",
        env: {
          NODE_ENV: "production",
          PORT: 3000
        },
        error_log: "logs/server-error.log",
        out_log: "logs/server-out.log",
        log_date_format: "YYYY-MM-DD HH:mm:ss",
        max_memory_restart: "4G"
      },
      {
        name: "token-monitor",
        script: "getTokenInfo.js",
        watch: true,
        ignore_watch: ["node_modules", "logs"],
        instances: 2,
        exec_mode: "fork",
        env: {
          NODE_ENV: "production"
        },
        error_log: "logs/monitor-error.log",
        out_log: "logs/monitor-out.log",
        log_date_format: "YYYY-MM-DD HH:mm:ss",
        max_memory_restart: "4G"
      }
    ]
  };