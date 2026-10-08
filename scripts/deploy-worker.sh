#!/usr/bin/env bash
# LTZZZ Worker 部署助手（总控自主部署用 · 不改仓库 · 仅本机运行时使用）
#
# 用途：总控（WorkBuddy/千问）在不打扰 owner 的前提下，自主部署 Cloudflare Worker。
# 依赖：CLOUDFLARE_API_TOKEN（来自 Key.doc，属主 ltzyz2181@gmail.com）
#
# ⚠️ 本脚本不含明文 token；运行时从环境变量读取。
# ⚠️ 请勿把 token 写进本脚本或提交进仓库。

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?需先 export CLOUDFLARE_API_TOKEN}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-44acab6e47bc1efd0e86b2f5b6bc1972}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

usage() {
  cat <<'EOF'
用法:
  deploy-worker.sh <wrangler-config.toml>
  deploy-worker.sh <wrangler-config.toml> secret <SECRET_NAME> <SECRET_VALUE>
  deploy-worker.sh --whoami

示例:
  deploy-worker.sh wrangler.xai.toml
  deploy-worker.sh wrangler.xai.toml secret XAI_API_KEY xai-xxxx
EOF
}

if [[ "${1:-}" == "--whoami" ]]; then
  npx --yes wrangler@4 whoami
  exit 0
fi

CONFIG="${1:-}"
[[ -z "$CONFIG" ]] && { usage; exit 1; }
CONFIG_PATH="$REPO_ROOT/$CONFIG"
[[ -f "$CONFIG_PATH" ]] || { echo "找不到配置: $CONFIG_PATH"; exit 1; }

if [[ "${2:-}" == "secret" ]]; then
  NAME="${3:?缺 secret 名}"
  VALUE="${4:?缺 secret 值}"
  echo "$VALUE" | npx --yes wrangler@4 secret put "$NAME" -c "$CONFIG"
  echo "✅ secret $NAME 已注入 $CONFIG"
else
  npx --yes wrangler@4 deploy -c "$CONFIG"
  echo "✅ 已部署 $CONFIG"
fi
