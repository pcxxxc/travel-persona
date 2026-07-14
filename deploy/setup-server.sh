#!/bin/bash
# ============================================================
# 旅格 Travel Persona · 服务器一键部署脚本
# ============================================================
# 用法:
#   chmod +x setup-server.sh
#   ./setup-server.sh
# ============================================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

APP_DIR="/opt/travel-persona"
REPO_URL="https://github.com/pcxxxc/travel-persona.git"
NODE_VERSION="24"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  旅格 Travel Persona · 服务器部署${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# ============================================================
# 1. 系统依赖
# ============================================================
echo -e "${YELLOW}[1/7] 安装系统依赖...${NC}"
apt-get update -qq
apt-get install -y -qq curl git nginx sqlite3 > /dev/null 2>&1
echo -e "${GREEN}  ✓ 系统依赖安装完成${NC}"

# ============================================================
# 2. Node.js
# ============================================================
echo -e "${YELLOW}[2/7] 检查/安装 Node.js ${NODE_VERSION}...${NC}"
if ! command -v node &> /dev/null || ! node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)"; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    echo -e "${GREEN}  ✓ Node.js $(node -v) 已安装${NC}"
else
    echo -e "${GREEN}  ✓ Node.js $(node -v) 已存在${NC}"
fi
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)" || {
    echo -e "${RED}  ✗ Node.js must be 22.5 or newer${NC}"
    exit 1
}

# ============================================================
# 3. PM2
# ============================================================
echo -e "${YELLOW}[3/7] 检查/安装 PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2 > /dev/null 2>&1
    echo -e "${GREEN}  ✓ PM2 已安装${NC}"
else
    echo -e "${GREEN}  ✓ PM2 $(pm2 -v) 已存在${NC}"
fi

# ============================================================
# 4. 克隆代码
# ============================================================
echo -e "${YELLOW}[4/7] 获取应用代码...${NC}"
if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}  应用目录已存在，执行 git pull 更新...${NC}"
    cd "$APP_DIR"
    git pull origin main
else
    echo -e "${YELLOW}  克隆仓库...${NC}"
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi
echo -e "${GREEN}  ✓ 代码已就绪 ($(git rev-parse --short HEAD))${NC}"

# ============================================================
# 5. 安装依赖
# ============================================================
echo -e "${YELLOW}[5/7] 安装 Node 依赖...${NC}"
cd "$APP_DIR"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
(
    cd "$APP_DIR/mcp-servers/baidu-map"
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
)
echo -e "${GREEN}  ✓ 依赖安装完成${NC}"

# ============================================================
# 6. 环境配置
# ============================================================
echo -e "${YELLOW}[6/7] 配置环境变量...${NC}"
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"

    # 生成随机 SESSION_SECRET
    SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=${SESSION_SECRET}/" "$APP_DIR/.env"

    # 生成随机 OPS_API_KEY
    OPS_API_KEY=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
    sed -i "s/^OPS_API_KEY=.*/OPS_API_KEY=${OPS_API_KEY}/" "$APP_DIR/.env"

    # 设置数据目录
    mkdir -p "$APP_DIR/.data"
    mkdir -p "$APP_DIR/.backups"
    mkdir -p "$APP_DIR/.logs"

    echo -e "${GREEN}  ✓ .env 文件已创建（已生成随机密钥）${NC}"
    echo -e "${YELLOW}  ⚠ 请编辑 $APP_DIR/.env 配置 API keys 和域名${NC}"
else
    echo -e "${GREEN}  ✓ .env 已存在，跳过${NC}"
fi

# ============================================================
# 7. Nginx 配置
# ============================================================
echo -e "${YELLOW}[7/7] 配置 Nginx...${NC}"
if [ -f "$APP_DIR/deploy/nginx.conf" ]; then
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/travel-persona
    ln -sf /etc/nginx/sites-available/travel-persona /etc/nginx/sites-enabled/travel-persona

    # 移除默认站点（如果存在）
    rm -f /etc/nginx/sites-enabled/default

    # 测试配置
    if nginx -t > /dev/null 2>&1; then
        systemctl reload nginx
        echo -e "${GREEN}  ✓ Nginx 配置已启用${NC}"
    else
        echo -e "${RED}  ✗ Nginx 配置有误，请检查${NC}"
        nginx -t
    fi
else
    echo -e "${RED}  ✗ 未找到 deploy/nginx.conf${NC}"
fi

# ============================================================
# 启动应用
# ============================================================
echo ""
echo -e "${YELLOW}启动应用...${NC}"
cd "$APP_DIR"
pm2 delete travel-persona 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 || true

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "应用目录:   $APP_DIR"
echo "访问地址:   http://$(hostname -I | awk '{print $1}')/app/"
echo "健康检查:   http://$(hostname -I | awk '{print $1}')/health"
echo ""
echo "常用命令:"
echo "  pm2 logs travel-persona    # 查看日志"
echo "  pm2 restart travel-persona # 重启应用"
echo "  pm2 status                 # 查看状态"
echo "  systemctl status nginx     # Nginx 状态"
echo ""
echo -e "${YELLOW}下一步: 编辑 $APP_DIR/.env 配置 API keys${NC}"
echo -e "${YELLOW}然后执行: pm2 restart travel-persona${NC}"
