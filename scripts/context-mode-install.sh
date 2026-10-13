#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$root/.ltzzz-tools/context-mode"
node -e 'if(Number(process.versions.node.split(".")[0])<22||(Number(process.versions.node.split(".")[0])===22&&Number(process.versions.node.split(".")[1])<5))throw Error("Node >=22.5 required")'
npm install --prefix "$runtime" --save-exact context-mode@1.0.169
CONTEXT_MODE_DIR="$runtime/data" node "$runtime/node_modules/context-mode/cli.bundle.mjs" index "$root/ltzzz-memory" --max-depth 1 --max-files 6 --include '魄.md' --include '识神.md' --include '梦境数据库.md' --include '文明研究.md' --include '项目历史.md' --include '重要事件.md' --project "$root"
CONTEXT_MODE_DIR="$runtime/data" node "$runtime/node_modules/context-mode/cli.bundle.mjs" search '观' --project "$root" --limit 1
printf '%s\n' 'Runtime installed and memory index tested. Register scripts/context-mode-server.sh in your MCP-capable client; registration is not automatic in phone chat apps.'
