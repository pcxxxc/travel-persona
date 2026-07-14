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

# 1. 拉取最新代码
echo -e "${YELLOW}  [1/3] 拉取最新代码...${NC}"
git pull origin main
echo -e "${GREEN}  ✓ 当前版本: $(git rev-parse --short HEAD)${NC}"

# 2. 安装依赖
echo -e "${YELLOW}  [2/3] 安装依赖...${NC}"
npm install --production --no-audit --no-fund 2>&1 | tail -3
echo -e "${GREEN}  ✓ 依赖已更新${NC}"

# 3. 重启应用
echo -e "${YELLOW}  [3/3] 重启应用...${NC}"
pm2 reload travel-persona
echo -e "${GREEN}  ✓ 应用已重启${NC}"

echo ""
echo -e "${GREEN}更新完成！${NC}"
pm2 status travel-persona
