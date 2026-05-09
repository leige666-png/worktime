#!/usr/bin/env bash
echo "******************** start compile deploy **********************"
set -e

# 安装依赖
npm --registry=http://r.npm.sankuai.com install

# 安装 Nest Runtime（Serverless 模式需要）
npm --registry=http://r.npm.sankuai.com install @fdfe/nest-runtime-nodejs-v2@latest

# 构建 Next.js 应用
npm run build

echo "******************** end compile deploy **********************"
