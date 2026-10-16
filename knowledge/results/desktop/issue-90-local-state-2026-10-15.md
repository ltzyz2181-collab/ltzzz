# Issue #90: local DeepSeek setup status

- Repository: `ltzyz2181-collab/ltzzz`
- Issue: [#90](https://github.com/ltzyz2181-collab/ltzzz/issues/90)
- Source preparation: PR #89, merge commit `6543354a8f475783b04c6acd77454708df2dd2fc`
- Workspace baseline: `5dbc05414f8f829bf8723ad9a92ddfd4512f0fb7`; `HEAD`, local `main`, and `origin/main` matched before this receipt was added. No pre-existing worktree changes were present.

## Status

| Checkpoint | Result | Evidence |
| --- | --- | --- |
| `prepared` | Blocked for this run | The no-secret template and preparation script are present in the repository. Running `node scripts/prepare-vscode-domestic.mjs` failed because `node` is not available in this environment; the local `.ltzzz-tools/vscode-domestic/` output was not generated. |
| `configured` | Not verified | No `code`/`code-insiders` command, standard VS Code executable path, or running VS Code process was available to this session. No user settings were read or changed. |
| `generation_verified` | Not run | No VS Code UI or configured DeepSeek credential was available. |
| `tool_roundtrip_verified` | Not run | No model request or file-read tool call was made. |

## Validation and blockers

- Script output: PowerShell reported `node : 无法将“node”项识别为 cmdlet、函数、脚本文件或可运行程序的名称。`
- Focused test command `node --test scripts/tests/vscode-domestic-setup.test.mjs` could not run for the same missing-Node reason. The existing recovery receipt `knowledge/results/recovery/vscode-domestic-setup-2026-10-16.json` records 10 earlier preparation tests passing; those are prior evidence, not a test run in this session.
- No API/model calls, credential access, credential writes, user-settings changes, or paid actions occurred.
- The repository template uses the VS Code secure-input reference `${input:ltzzzDeepSeekApiKey}`; it contains no actual key.

## Owner action required

On the owner’s VS Code desktop, open the Command Palette with `Ctrl+Shift+P` → **Chat: Manage Language Models** → **Add Models** → **Custom Endpoint**. Enter the DeepSeek key directly into VS Code’s secure key input, never into chat, an issue, or a file. Then merge the two model entries from `config/vscode/deepseek.chatLanguageModels.template.json` into the wizard-created user configuration while preserving the generated secret reference and all existing providers. After that, a desktop operator must verify the selected model and utility-model settings, then perform exactly one documented Flash file-read check of `ops/relay-readonly-task.txt` and capture the visible model, tool-call record, request ID, and usage if shown. None of those desktop steps is claimed complete here.

## Follow-up check (2026-10-16 07:39 UTC)

- VS Code is now present and running in the environment. Its CLI reports version `1.142.0` (commit `6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1`, x64). `code --list-extensions` returned no extension IDs; this CLI result does not establish which chat features are available in the running UI.
- The owner-reported issue update says `LTZZZ DeepSeek Flash` was selected in the model picker and returned `OK`. A prior owner-reported read smoke used `README.md` after `ops/relay-readonly-task.txt` was missing in that desktop checkout, but no actual file-read tool trace, request ID, or usage was supplied. This remains owner-reported evidence, not an independently verified model call or tool roundtrip.
- Node is still unavailable (`where.exe node.exe` and standard Node install paths returned no executable), so the preparation script and focused tests remain unrun in this environment. The VS Code UI cannot be inspected or driven here; no settings or credentials were read or changed.
- A read-only fetch found `origin/main` at `bb6cf69866a6484106f14bf61a3786d0aff21fa3`; this worktree's local `main` remains at `5dbc05414f8f829bf8723ad9a92ddfd4512f0fb7`. No main checkout was updated. `tool_roundtrip_verified` remains false; this follow-up made no model request.
