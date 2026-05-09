# ============================================
# 工时管理系统 - Docker 多阶段构建
# 适用于 HULK 容器平台部署
# ============================================

# --- 阶段1: 安装依赖 ---
FROM node:22-alpine AS deps
WORKDIR /app

# 使用美团内部 npm 源
RUN npm config set registry http://r.npm.sankuai.com

COPY package.json package-lock.json* ./
RUN npm ci --only=production && \
    cp -R node_modules /prod_modules && \
    npm ci

# --- 阶段2: 构建应用 ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 设置构建时环境变量
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# --- 阶段3: 生产运行 ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 standalone 产物
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

# 启动 Next.js standalone server
CMD ["node", "server.js"]
