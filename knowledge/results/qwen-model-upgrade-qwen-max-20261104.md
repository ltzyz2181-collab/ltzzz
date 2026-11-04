# 千问模型升级：qwen-plus → qwen-max（2026-11-04，owner 指令）

## 背景
11-04 千问排查确认「非能力问题、是输出预算不足」（commit ecc338f7：日课默认 2048→4096）。owner 随后拍板：**升级千问模型到 qwen-max**，处理并核对结果，结果交 GPT 人工席测试。

## 改动面（全链路统一升到 qwen-max）
| 文件 | 改动 |
|---|---|
| `qianwen-proxy-worker.js` | 默认 model 'qwen-plus'→'qwen-max'（health 显示 + POST 调用两处） |
| `scripts/deploy-agent-provenance.mjs` | qianwen 席部署时 secret put `QWEN_MODEL=qwen-max`（secret 优先于历史 worker var；health 验证谓词增加 `configured_model==='qwen-max'` 断言） |
| `scripts/lib/qwen-config.mjs` | 默认 model 'qwen-plus'→'qwen-max'（日课 native 通道） |
| `scripts/lib/model-catalog.mjs` | 目录 fallback 'qwen-plus'→'qwen-max' |
| `data/tasks/daily-tasks.json` | native_qianwen_daily.default_model → qwen-max |
| `config/ai-providers.json` | qianwen.default_model → qwen-max（note 同步） |
| `.github/workflows/qwen-dispatch.yml` | DASHSCOPE_MODEL 默认 → qwen-max（GitHub repo 无 DASHSCOPE_MODEL/QWEN_MODEL var，文件默认即生效） |
| `scripts/tests/qwen-native.test.mjs` | 断言 b.model 'qwen-plus'→'qwen-max' |
| `scripts/tests/audit-evidence.test.mjs` | 断言 qianwen worker 默认 'qwen-plus'→'qwen-max' |

未改：`api/agents/qianwen/card.json` 两处 configured_model=qwen-plus 是 **11-02 历史健康快照**（observed_at 明确），按历史留痕原则保留；升级后的新值由本次部署回执与后续健康验证体现。
未改：`run-qwen-dispatch.mjs` qwen ceiling 2048（刻意护栏，防 kimi 借道放宽，测试锁定）。

## 验证
- 本地：qwen-native / qwen-dispatch / provider-execution / audit-evidence / model-catalog / kimi-model-override / proxy-auth = **57/57 pass**。
- 部署：push 触发 deploy-agent-provenance.yml（paths 含 qianwen-proxy-worker.js + deploy-agent-provenance.mjs）→ wrangler 注入 QWEN_MODEL=qwen-max → health 回读须 `configured_model=qwen-max`（谓词含断言，不满足即部署失败标记）。
- 真实调用核对：dispatch 新卡（不带 model 字段）→ CI 消费 → 回执 model=qwen-max 为据。

## 模型成本提示
qwen-max 输出能力更强、单次调用成本高于 qwen-plus。日课 max_calls_per_day=1、dispatch 卡逐张派发，无自动批量放大；如需回退改 `QWEN_MODEL` secret / 代码默认即可（qwen-plus 显式 pin 仍被接受）。

## 记账
paid=false、tx_hash=null、income=0；无密钥改动泄露、无资金动作。
