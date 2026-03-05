module.exports = {
  apps: [
    {
      name: 'algo-trader',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      out_file: 'logs/algo-trader-out.log',
      error_file: 'logs/algo-trader-error.log',
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
