// PM2 Ecosystem Configuration for Algo-Trade RaaS Platform
module.exports = {
  apps: [
    {
      name: 'algo-trade',
      script: 'src/app.ts',
      interpreter: 'node_modules/.bin/tsx',
      cwd: __dirname,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        DB_PATH: './data/algo-trade.db',
      },
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        DB_PATH: './data/algo-trade.db',
        API_PORT: '3000',
        DASHBOARD_PORT: '3001',
        LANDING_PORT: '3002',
        WS_PORT: '3003',
        WEBHOOK_PORT: '3004',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
