#!/usr/bin/env bash
# LTZZZ seat token injection.
# Resolves a GitHub token and injects it into ONE child process:
# GH_TOKEN / GITHUB_TOKEN are set in the child environment only.
# The value is never printed and never written to disk.
#
# Usage:
#   scripts/seat-token-env.sh --check
#   scripts/seat-token-env.sh --exec <command> [args...]
#
# Resolution order: GH_TOKEN, GITHUB_TOKEN, ~/.config/ltzzz/github.env,
#                   git credential fill (host=github.com).
# Exit codes: 0 ok, 2 usage, 3 token_missing, otherwise the child exit code.
set -uo pipefail

src=""
tok=""

read_token_file() {
  local file="$1" line
  [ -r "$file" ] || return 1
  while IFS= read -r line; do
    case "$line" in
      GH_TOKEN=*) tok=${line#GH_TOKEN=} ;;
      GITHUB_TOKEN=*) [ -z "$tok" ] && tok=${line#GITHUB_TOKEN=} ;;
    esac
  done < "$file"
  [ -n "$tok" ]
}

resolve_token() {
  tok=""
  if [ -n "${GH_TOKEN:-}" ]; then src="env:GH_TOKEN"; tok="$GH_TOKEN"; return 0; fi
  if [ -n "${GITHUB_TOKEN:-}" ]; then src="env:GITHUB_TOKEN"; tok="$GITHUB_TOKEN"; return 0; fi
  local envfile="${LTZZZ_GITHUB_ENV:-$HOME/.config/ltzzz/github.env}"
  if read_token_file "$envfile"; then src="file:github.env"; return 0; fi
  command -v git >/dev/null 2>&1 || return 1
  local out line
  out=$(printf 'protocol=https\nhost=github.com\n\n' | GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=true git credential fill 2>/dev/null) || true
  while IFS= read -r line; do
    case "$line" in
      password=*) tok=${line#password=} ;;
    esac
  done <<EOF
$out
EOF
  [ -n "$tok" ] || return 1
  src="git_credential_fill"
  return 0
}

usage() {
  cat <<'USAGE'
seat-token-env: inject GH_TOKEN/GITHUB_TOKEN into one child process only.

  scripts/seat-token-env.sh --check
      Print {"has_token":true|false,"source":"..."} without the token value.

  scripts/seat-token-env.sh --exec <command> [args...]
      Run the command with GH_TOKEN and GITHUB_TOKEN set.
      Nothing is printed or persisted; the parent environment is unchanged.

Resolution order: GH_TOKEN, GITHUB_TOKEN, ~/.config/ltzzz/github.env,
                  git credential fill (host=github.com).
Exit codes: 0 ok, 2 usage, 3 token_missing.
USAGE
}

case "${1:---help}" in
  --check)
    if resolve_token; then
      printf '{"has_token":true,"source":"%s"}\n' "$src"
      exit 0
    fi
    printf '{"has_token":false,"source":"none"}\n'
    exit 3
    ;;
  --exec)
    shift
    if [ "$#" -eq 0 ]; then usage >&2; exit 2; fi
    if ! resolve_token; then
      printf '{"error":"token_missing","source":"none","hint":"export GH_TOKEN or write GH_TOKEN=... to ~/.config/ltzzz/github.env (chmod 600)"}\n' >&2
      exit 3
    fi
    GH_TOKEN="$tok" GITHUB_TOKEN="$tok" "$@"
    exit $?
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
