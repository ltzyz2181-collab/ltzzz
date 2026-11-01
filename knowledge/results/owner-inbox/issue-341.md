# 国内执行席工单回执 · issue-341

状态：submitted_pending_review；运行：41300694703。仅草稿，未验收、未发布、未交易。

## 国内模型交付 · 实际 DeepSeek / deepseek-v4-pro（岗位标识：GPT）

```json
{
  "task_id": "ANS-2026-10-25-deepseek",
  "source_read_commit": "42050ac955e4090e68cef73e28f92708e877fbbf",
  "verification": {
    "provider_model": "DeepSeek/deepseek-v4-pro",
    "source_commit": "8127e1c1ba70f4f8d1be38c2c55415c1dfb11c1e",
    "sha256": "2820cc81736cfd465b1e4bf067cddfded8383279ae3ab2ec2df63842d9086416",
    "finish_reason": "stop",
    "usage": {"tokens_used": 27639}
  },
  "original_status": "draft_rejected",
  "engineering_fix_verified": false,
  "limitations": [
    "仅基于受管总控提供的哈希与逐字段摘录；无GitHub/终端，未亲自读取或计算文件哈希。",
    "verification中的source_commit、sha256、provider_model、finish_reason、usage均为材料records[0]记录值，非本执行器生成。",
    "未重放原作者/审核请求、未部署、未付款。",
    "原始拒绝状态draft_rejected和original_uncertain_doubao_attempt_preserved=true均保留，未改写。",
    "engineering_fix_verified=false仅表示记录核验，不构成生产修复验收或文件落盘声明。"
  ]
}
```

```json
{
  "review_of_deepseek": {
    "accepted": true,
    "reasons": [
      "未声称亲自访问GitHub或计算哈希，sha256/source_commit仅作为材料值引用。",
      "verification与材料2026-10-25记录一致：DeepSeek deepseek-v4-pro、finish_reason=stop、usage.tokens_used=27639、worker artifact哈希2820cc...。",
      "保留original_status=draft_rejected并显式engineering_fix_verified=false，未升格为修复完成。",
      "未补造worker文件没有的顶层字段，未含self_sha256或null自哈希。"
    ]
  },
  "doubao_reconcile": {
    "task_id": "ANS-2026-10-18-doubao",
    "source_read_commit": "42050ac955e4090e68cef73e28f92708e877fbbf",
    "original_status": "draft_rejected",
    "calls_summary": [
      "DeepSeek成功：deepseek-v4-pro，finish_reason=stop，tokens_used=13429",
      "Doubao成功：doubao-seed-2-1-pro-260915，finish_reason=stop，tokens_used=15032"
    ],
    "unknown_request_replay_allowed": false,
    "engineering_fix_verified": false,
    "limitations": [
      "仅基于总控提供的2026-10-18记录与哈希摘录，未亲自访问仓库或计算哈希。",
      "未重放原请求/审核、未部署、未付款。",
      "2026-10-18源记录source_commit=b4e6a2d0fdfb73205c8647f1d413934b4474a056；与source_read_commit不同，未混用。",
      "不声称文件已落盘或哈希由本执行器生成，原始拒绝状态保留。"
    ]
  }
}
```

## 国内模型复核 · 实际 Doubao / doubao-seed-2-1-pro-260915（岗位标识：Claude）

## 国内模型只读复核结论

两份草稿**不得直接验收**：字段值大体可追溯，但存在“越权核验”“证据未逐字段引用”“审核职责混入第二执行者自证”等问题。以下为可复用修订。

---

### 一、DeepSeek 第一执行者 JSON：问题与修订

#### 发现的问题
1. **`verification.provider_model` 越界**  
   材料只能证明：`executed_by="DeepSeek"`、`model="deepseek-v4-pro"`。不能把它写成本次复核者的真实 provider/model；也不能暗示当前调用由 DeepSeek 执行。

2. **`sha256` 未限定为 worker artifact**  
   六文件中存在多个 SHA256。草稿写的是 `2026-10-25-worker.json` 的哈希，但 JSON 字段名仅为 `sha256`，复用者可能误解为源文件或当前输出哈希。

3. **缺少 `usage` 细项边界**  
   材料只有 `tokens_used=27639`，没有 prompt/completion tokens。应明确“总 token 数，成分未知”。

4. **缺少关键异常记录**  
   2026-10-25 有一次 Doubao：
   `provider_incomplete_or_uncertain`、model=null、finish_reason=null、tokens_used=0；随后 Qianwen 完成 reviewer。该缺口必须进入 limitations，否则只呈现成功 worker，易误读为流程完整。

5. **`engineering_fix_verified:false` 正确，但理由不足**  
   材料仅显示 `remote_review_status="rejected_draft_review"`，没有测试、部署、补丁或生产回执。

#### 可复用修订 JSON

```json
{
  "task_id": "ANS-2026-10-25-deepseek",
  "source_read_commit": {
    "value": "42050ac955e4090e68cef73e28f92708e877fbbf",
    "evidence": "受管总控声明于该读取提交读取原始Git文件；本轮模型未亲自访问仓库或计算哈希。"
  },
  "verification": {
    "provider_model": {
      "value": "DeepSeek/deepseek-v4-pro",
      "evidence": "records[2026-10-25].calls[0]: requested_agent、executed_by均为DeepSeek，model为deepseek-v4-pro。",
    },
    "source_commit": {
      "value": "8127e1c1ba70f4f8d1be38c2c55415c1dfb11c1e",
      "evidence": "records[2026-10-25].source_commit；这是原记录源提交，不等同source_read_commit。"
    },
    "sha256": {
      "value": "2820cc81736cfd465b1e4bf067cddfded8383279ae3ab2ec2df63842d9086416",
      "artifact_path": "knowledge/results/ans-cycle/2026-10-25-worker.json",
      "evidence": "sources与artifacts中role=worker、executed_by=DeepSeek对应哈希；由执行器读取原始字节计算，非本轮模型计算。"
    },
    "finish_reason": {
      "value": "stop",
      "evidence": "records[2026-10-25].calls[0].finish_reason。"
    },
    "usage": {
      "tokens_used": 27639,
      "evidence": "records[2026-10-25].calls[0].tokens_used；材料未提供prompt/completion分项。"
    }
  },
  "original_status": {
    "value": "draft_rejected",
    "evidence": "records[2026-10-25].status及remote_review_status=rejected_draft_review。"
  },
  "engineering_fix_verified": false,
  "limitations": [
    "本轮仅复核总控提供的哈希、元数据和摘录；未亲自访问GitHub、终端，也未重新计算任何文件哈希。",
    "不能确认worker正文语义、补丁正确性、测试结果、部署状态或生产修复。",
    "同日Doubao首次调用为provider_incomplete_or_uncertain，model、finish_reason均为null，tokens_used=0；reviewer后由Qianwen/qwen-plus完成。",
    "原始拒绝仍保留；不重放请求、不部署、不付款、不声称文件已落盘。",
    "source_read_commit与原任务source_commit不同，分别代表受管读取点和原记录源点。"
  ]
}
```

> 注：上面 `provider_model` 对象内有一个尾随逗号，若目标解析器要求严格 JSON，应删除；结构稿保留字段说明时建议先作为 JSONC/人工审校稿，落盘前用解析器校验。

---

### 二、Doubao 第二执行者 JSON：问题与修订

#### 发现的问题
1. **`review_of_deepseek.accepted=true` 证据不足**  
   第二执行者可以“接受第一执行者对材料的转录一致性”，但不能替代原 reviewer，也不能把该接受升级为原 DeepSeek 工单通过。

2. **未核对 reviewer 与 worker 的角色边界**  
   2026-10-18 材料中 DeepSeek 是 worker，Doubao 是 reviewer。第二执行者本轮只做 reconcile，不应冒充原始 Doubao reviewer。

3. **缺少 artifact 哈希**
   - Worker：`0321ccc0...`
   - Reviewer：`6f96841e...`
   虽用户给的目标 schema 未强制 artifact 字段，但至少在 limitations 或 evidence 中说明已见到对应哈希，不能只总结 calls。

4. **`unknown_request_replay_allowed:false` 正确，但需解释对象**
   禁止的是重放未知/历史作者请求和审核请求；不是禁止只读比对。

5. **未区分三类 commit**
   - 本轮受管读取提交：`42050ac...`
   - 2026-10-18 原源提交：`b4e6a2d...`
   - 材料未给当前输出落盘 commit，故不得声称。

#### 可复用修订 JSON

```json
{
  "review_of_deepseek": {
    "accepted": false,
    "acceptance_scope": "仅允许接受为“材料转录基本一致的只读草稿”；不接受为原DeepSeek工单验收、工程修复验收或生产审核。",
    "reasons": [
      "DeepSeek worker的provider/model、finish_reason、tokens_used及worker哈希能在2026-10-25材料中逐项对应。",
      "原草稿未清楚说明同日Doubao异常调用及后续Qianwen代审，流程证据不完整。",
      "sha256字段未限定为2026-10-25-worker.json，且容易被误解为当前JSON自哈希。",
      "材料显示draft_rejected/rejected_draft_review，不存在工程修复已验证的证据。",
      "本轮复核不得冒充OpenAI、Anthropic、DeepSeek、Doubao原始运行，也不得重放原请求。"
    ]
  },
  "doubao_reconcile": {
    "task_id": "ANS-2026-10-18-doubao",
    "source_read_commit": "42050ac955e4090e68cef73e28f92708e877fbbf",
    "original_status": "draft_rejected",
    "calls_summary": [
      {
        "role": "worker",
        "executed_by": "DeepSeek",
        "model": "deepseek-v4-pro",
        "finish_reason": "stop",
        "tokens_used": 13429,
        "worker_sha256": "0321ccc0e2dc25d2ca9ad9f66d80aa18d0033b35405de8b2d0fd123b176ee617"
      },
      {
        "role": "reviewer",
        "executed_by": "Doubao",
        "model": "doubao-seed-2-1-pro-260915",
        "finish_reason": "stop",
        "tokens_used": 15032,
        "reviewer_sha256": "6f96841ec1891bd9879d8a894316d1bf410f76fdfa16dbe26b7a94f5fe7b8960"
      }
    ],
    "unknown_request_replay_allowed": false,
    "engineering_fix_verified": false,
    "limitations": [
      "仅依据受管总控提供的六文件哈希、逐字段摘录和记录汇总；未亲自访问GitHub、终端或重算哈希。",
      "2026-10-18原source_commit为b4e6a2d0fdfb73205c8647f1d413934b4474a056，不得与本轮source_read_commit=42050ac混用。",
      "status=draft_rejected且remote_review_status=rejected_draft_review；原拒绝保留。",
      "材料只证明历史调用元数据和artifact哈希存在，不证明正文审核结论正确、代码缺陷已修、测试通过或已部署。",
      "本轮不重放原作者/审核请求，不付款，不改变权限，不声称external_manifest或任何JSON已落盘。"
    ]
  }
}
```

---

## 可复用验收清单（只读 reconcile）

后续同类任务建议逐项打勾：

1. **身份边界**
   - [ ] 不自称 GPT/Claude/DeepSeek/Doubao 原模型。
   - [ ] 区分“岗位名”“历史执行者”“当前复核模型”。
   - [ ] 当前模型无真实 provider 响应记录时，不伪造 provider/model/call id。

2. **输入边界**
   - [ ] 只引用受管总控提供材料。
   - [ ] 不声称亲自访问 GitHub、终端、文件系统。
   - [ ] 不声称亲自计算 SHA256。
   - [ ] 哈希必须带文件路径、角色和计算者说明。

3. **字段一致性**
   - [ ] `task_id` 与目标日期/角色一致。
   - [ ] `source_read_commit` 与原任务 `source_commit` 分列。
   - [ ] `model=null`、`finish_reason=null` 等异常不得删除。
   - [ ] `tokens_used` 无分项时不拆造 prompt/completion。
   - [ ] 无 `self_sha256`、无 null 自哈希、无落盘 commit。

4. **流程完整性**
   - [ ] worker 与 reviewer 分开核对。
   - [ ] 代执行、失败、不确定调用必须显式保留。
   - [ ] `draft_rejected` / `rejected_draft_review` 不被改写为 accepted。
   - [ ] “接受材料转录”不等于“接受原工作成果”。

5. **工程验收边界**
   - [ ] 没有测试结果不得写 fix verified。
   - [ ] 没有部署回执不得写 deployed。
   - [ ] 没有交易/付款凭证不得写 paid。
   - [ ] 没有权限变更证据不得写权限已改。
   - [ ] 没有 manifest 落盘证据不得由执行 JSON 代替 external_manifest。

6. **安全动作**
   - [ ] 不重放未知请求。
   - [ ] 不执行命令。
   - [ ] 不登录、不发布、不转账、不改权限。
   - [ ] 只产出分析、文字或代码草稿。

**最终判断：**两份原草稿可作为“字段转录草稿”，但不应直接作为验收记录；按上述修订后，可满足本轮只读 verification/reconcile 的留痕要求。
