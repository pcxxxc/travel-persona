# 旅格 Travel Persona · 服务器部署指南

## 快速开始（推荐）

在服务器上执行以下命令即可一键部署：

```bash
# 克隆仓库
git clone https://github.com/pcxxxc/travel-persona.git /opt/travel-persona
cd /opt/travel-persona

# 运行一键部署脚本
chmod +x deploy/setup-server.sh
./deploy/setup-server.sh
```

脚本会自动完成：
- 安装系统依赖（Node.js 20、Nginx、Git、SQLite）
- 安装 PM2 进程管理器
- 安装 Node 依赖
- 生成随机密钥（SESSION_SECRET、OPS_API_KEY）
- 配置 Nginx 反向代理
- 启动应用

---

## 部署后配置

部署完成后，编辑 `.env` 文件配置 API Key：

```bash
cd /opt/travel-persona
nano .env
```

### 必要配置项

```env
# 域名配置（用于 CORS）
ALLOWED_ORIGINS=http://your-domain.com

# DeepSeek AI（推荐，用于路线规划增强）
AGENT_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# 百度地图（可选，用于 POI 和坐标）
MAP_PROVIDER=mcp
BAIDU_MAP_AUTH_TOKEN=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

配置完成后重启应用：

```bash
pm2 restart travel-persona
```

---

## 手动部署步骤

如果一键脚本不适用，可按以下步骤手动部署。

### 1. 环境准备

```bash
# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx sqlite3

# 安装 PM2
npm install -g pm2
```

### 2. 获取代码

```bash
git clone https://github.com/pcxxxc/travel-persona.git /opt/travel-persona
cd /opt/travel-persona
npm install --production
```

### 3. 环境配置

```bash
cp .env.example .env
# 编辑 .env 填入 API Key 和配置
```

### 4. 启动应用

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd
```

### 5. 配置 Nginx

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/travel-persona
ln -s /etc/nginx/sites-available/travel-persona /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

---

## 常用命令

```bash
# 查看应用状态
pm2 status
pm2 logs travel-persona

# 重启/停止
pm2 restart travel-persona
pm2 stop travel-persona

# Nginx
systemctl status nginx
systemctl reload nginx

# 更新应用
cd /opt/travel-persona
./deploy/update-app.sh
```

---

## 访问地址

部署完成后：
- **应用首页**: `http://服务器IP/app/`
- **健康检查**: `http://服务器IP/health`
- **API 根路径**: `http://服务器IP/api/v1/`

---

## 故障排查

### 应用无法启动

```bash
pm2 logs travel-persona --lines 50
```

### Nginx 502 Bad Gateway

检查 Node 应用是否在运行：
```bash
pm2 status
curl http://127.0.0.1:3000/health
```

### API 返回错误

查看应用日志：
```bash
pm2 logs travel-persona --err
```
