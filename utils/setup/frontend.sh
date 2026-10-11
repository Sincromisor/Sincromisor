#!/usr/bin/env bash
# 旧入口もルートのロックと実行環境の検査へ委譲する。
set -euo pipefail
cd "$(dirname "$0")/../.."
node scripts/check-node-version.mjs
npm ci
NODE_ENV=production NODE_OPTIONS="--max-old-space-size=2048" npm run build
