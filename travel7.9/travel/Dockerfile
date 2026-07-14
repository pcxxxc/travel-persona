FROM node:18-alpine

LABEL maintainer="travel-persona"
LABEL description="旅格 Travel Persona — 基于旅游人格画像的 AI 目的地决策系统"

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package*.json ./

# 生产依赖安装
RUN npm ci --production && npm cache clean --force

# 复制源码
COPY . .

# 静态文件目录
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
