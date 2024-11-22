#!/bin/bash

# 项目目录
APP_DIR="/root/pump"
GITHUB_REPO="https://github.com/EXLF/pump.git"

# 确保目录存在
mkdir -p $APP_DIR
cd $APP_DIR

# 创建日志目录
mkdir -p logs

# 如果是首次部署
if [ ! -d ".git" ]; then
    git clone $GITHUB_REPO .
else
    # 拉取最新代码
    git pull
fi

# 安装依赖
npm install

# 使用 PM2 重启服务
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js 