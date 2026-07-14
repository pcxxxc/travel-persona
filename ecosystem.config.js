/**
 * PM2 配置文件
 *
 * 生产环境使用 cluster 模式，2 实例负载均衡。
 * 开发环境使用 fork 模式，单实例便于调试。
 */
module.exports = {
  apps: [{
    name: 'travel-persona',
    script: './server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_development: {
      NODE_ENV: 'development',
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
