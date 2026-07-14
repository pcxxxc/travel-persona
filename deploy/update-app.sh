#!/bin/bash
# ============================================================
# 旅格 Travel Persona · 应用更新脚本
# ============================================================
# 用法: ./update-app.sh
# ============================================================

set -e

APP_DIR="/opt/travel-persona"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}更新旅格应用...${NC}"
cd "$APP_DIR"

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)" || {
    echo "Node.js 22.5 or newer is required. Run deploy/setup-server.sh to install Node 24 first."
    exit 1
}

# 1. 拉取最新代码
echo -e "${YELLOW}  [1/4] 拉取最新代码...${NC}"
git pull origin main
echo -e "${GREEN}  ✓ 当前版本: $(git rev-parse --short HEAD)${NC}"

# 2. 安装依赖
echo -e "${YELLOW}  [2/4] 安装依赖...${NC}"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
(
    cd "$APP_DIR/mcp-servers/baidu-map"
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
)
echo -e "${GREEN}  ✓ 依赖已更新${NC}"

# 3. 重启应用
echo -e "${YELLOW}  [3/4] 重启应用...${NC}"
pm2 reload travel-persona
echo -e "${GREEN}  ✓ 应用已重启${NC}"

# 4. Fail the deployment loudly instead of leaving Nginx serving a 502.
echo -e "${YELLOW}  [4/4] 验证应用健康状态...${NC}"
for attempt in $(seq 1 10); do
    if curl -fsS http://127.0.0.1:3000/health > /dev/null; then
        echo -e "${GREEN}  ✓ 健康检查通过${NC}"
        break
    fi
    if [ "$attempt" = "10" ]; then
        echo "Application did not become healthy after reload."
        pm2 logs travel-persona --lines 80 --nostream || true
        exit 1
    fi
    sleep 1
done

echo ""
echo -e "${GREEN}更新完成！${NC}"
pm2 status travel-persona
