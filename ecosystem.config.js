/**
 * PM2 配置文件
 *
 * 使用 fork 模式单实例运行，避免 SQLite 并发写入锁库。
 * SQLite 不支持多进程并发写，cluster 模式会导致 database locked 错误。
 */
module.exports = {
  apps: [{
    name: 'travel-persona',
    script: './server.js',
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_log: './logs/err.log',
    out_log: './logs/out.log',
    merge_logs: true,
    max_memory_restart: '512M',
    restart_delay: 3000,
    max_restarts: 5,
    min_uptime: '10s'
  }]
};
