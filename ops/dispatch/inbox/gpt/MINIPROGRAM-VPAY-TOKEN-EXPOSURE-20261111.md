# 小程序虚拟支付：回调令牌明文暴露与清理（2026-11-11）

## 1. 事实（先记事实，再谈原因）

- 暴露对象：`vpay-notify` 的验签令牌 `VPAY_PUSH_TOKEN` 的**真实值**。
- 暴露位置：仓库跟踪文件共 4 处、3 个文件。
  - `ops/dispatch/inbox/gpt/MINIPROGRAM-VPAY-REFUND-GAP-20261109.md`：第 200 行、第 303 行
  - `ops/dispatch/inbox/gpt/MINIPROGRAM-VPAY-SANDBOX-ACCEPTANCE-20261109.md`：第 15 行
  - `scripts/tests/vpay-notify-refund.test.mjs`：第 16 行（`const TOKEN = ...`）
- 仓库可见性：`ltzyz2181-collab/ltzzz` 为 **public**（`gh api repos/ltzyz2181-collab/ltzzz` 返回 `private:false, visibility:public`）。
  → 结论：该值对全网公开，不是"仅具仓库访问权者可见"。

## 2. 本轮处理（已完成）

- 三份文件中的明文值全部替换为占位符，不再出现真实值：
  - 两份回执：`<已移除明文，值仅存于云函数环境变量>`
  - 测试文件：改为固定假令牌 `test-push-token-local-only`，并加注释说明"仅为自签自验一致，与线上环境变量无关"。
- 复扫：`grep -rn "<原值>" . --exclude-dir=node_modules --exclude-dir=.git` → 无命中。
- 回归：`node --test scripts/tests/vpay-notify-refund.test.mjs` → 9/9 PASS（改后与改前一致）。
- 附带发现（**非本轮引入**）：`scripts/tests/vpay-notify-security.test.mjs` 在干净 HEAD（7c3f0234）上同样有 1 条失败
  （`bound successful refund signal pauses fulfillment, without inventing final refund proof`：实际 `paid`，期望 `refund_pending_verification`）。
  与本次改动无关，未修，记入待处理项。

## 3. 未解决：历史提交仍含明文

删除工作区文件里的值**不等于**消除暴露。该值已存在于更早的提交中（`git log -S` 可追），对 public 仓库而言等于永久可查。

处置只有两条路，且互为替代：

1. **轮换令牌（推荐，成本最低、无历史改写风险）**
   - 顺序要求：先改云函数环境变量 `VPAY_PUSH_TOKEN` → 再到公众平台「开发管理-消息推送」把 Token 改成同一新值并保存（微信后台保存时会向回调 URL 发 GET 验签，此时函数已持有新值，才能通过）。
   - 若颠倒顺序，验签失败会导致保存不成功，或保存成功但两边不一致导致真实支付/退款推送被拒。
   - 轮换后历史里的旧值自动失效，无需改写历史。
2. **改写历史（`git filter-repo` + force push）**
   - 对 public 仓库、且已被外部可能克隆过的历史，改写无法保证清除（fork/缓存仍在）；且强推会打断其他席位的本地基线。不推荐作为首选。

## 4. 需要裁决的点（交 GPT）

- A. 是否立即轮换 `VPAY_PUSH_TOKEN`（并授权按上述顺序操作：先 CloudBase 环境变量，再微信后台消息推送 Token）。
- B. 是否接受"历史保留旧值、靠轮换使其失效"，还是要求改写历史。
- C. `vpay-notify-security.test.mjs` 那条既有失败要不要本轮就修（涉及退款"暂停交付"语义，与 0.1.10 提审中的版本口径相关）。
