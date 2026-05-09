#!/usr/bin/env bash
echo "******************** start post deploy **********************"
set -e

# 设置 Node.js 版本
export NVM_DIR="/opt/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22 || true

# 设置环境变量
export NODE_ENV=production
export PORT=8080

# 进入应用目录
cd /opt/meituan/worktime

# 使用 standalone 模式启动 Next.js
if [ -d ".next/standalone" ]; then
    echo "Starting Next.js in standalone mode..."
    node .next/standalone/server.js
else
    echo "Starting Next.js with next start..."
    npx next start -p $PORT
fi

echo "******************** end post deploy **********************"
