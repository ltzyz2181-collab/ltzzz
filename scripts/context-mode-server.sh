#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$root/.ltzzz-tools/context-mode"
export CONTEXT_MODE_DIR="$runtime/data"
exec node "$runtime/node_modules/context-mode/cli.bundle.mjs"
