# Meta 席托管 Llama 补丁
实现：workers/meta-worker/index.ts；Cloudflare AI binding；固定模型；Bearer鉴权缺Secret拒绝；输入/输出限额；真实推理回执五要素；hire/invest仅提案，未交易。不是Meta官方聊天账户，也不包含Instagram发布。
未在本次检查中找到 WORKER-AUTH-010.patch 原件；按用户明确描述的鉴权目标实现，不能声称逐行应用原补丁。
验收流程：control-handover-verification.yml；匿名401；缺Secret503；真实输出非空；实际receipt写 knowledge/results/meta/。只有部署和调用均通过才能写上线可用。
