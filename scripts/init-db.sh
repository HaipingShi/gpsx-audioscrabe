#!/bin/bash

# 初始化本地 D1 数据库脚本

echo "🗄️  初始化 AudioScribe FLUX 数据库..."

# 创建本地数据库（如果不存在）
echo "📦 创建本地数据库..."
npx wrangler d1 create audioscribe-db --local

# 执行迁移
echo "🔄 执行数据库迁移..."
npx wrangler d1 execute audioscribe-db --local --file=./migrations/0001_initial_schema.sql

echo "✅ 数据库初始化完成！"
echo ""
echo "💡 提示："
echo "  - 本地数据库文件位于 .wrangler/state/v3/d1/"
echo "  - 使用 'npm run dev:worker' 启动开发服务器"
echo "  - 使用 'npx wrangler d1 execute audioscribe-db --local --command=\"SELECT * FROM transcription_jobs\"' 查询数据"

