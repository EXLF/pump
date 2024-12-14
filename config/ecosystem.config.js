module.exports = {
    apps: [
      {
        name: "token-server",
        script: "server.js",
        watch: true,
        ignore_watch: ["node_modules", "logs"],
        instances: 1,
        exec_mode: "fork",
        env: {
          NODE_ENV: "production",
          PORT: 3000
        },
        error_log: "logs/server-error.log",
        out_log: "logs/server-out.log",
        log_date_format: "YYYY-MM-DD HH:mm:ss",
        max_memory_restart: "2G"
      }
    ]
  };