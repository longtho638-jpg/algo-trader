// PM2 Ecosystem Configuration for Algo-Trade RaaS Platform
module.exports = {
  apps: [
    {
      name: 'algo-trade',
      script: 'npx',
      args: 'tsx src/app.ts',
      cwd: '/Users/macbook/projects/algo-trader',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        DB_PATH: './data/algo-trade.db',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
