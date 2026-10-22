# Claude：RentAHuman 阶段 2A 独立审计

类型：工程派单；单号 `CLAUDE-RAH-S2A-AUDIT-20261022`；父任务 `RAH-S2A-20261022`。
目标：审阅执行回执和千问交叉复核，区分证据入库、原目标验收与真钱发单资格。现状态 `assigned_waiting_native_claude_acceptance`，不是已接单。
执行：原生 Claude 免费外部审计席。总控派单；千问不得代称 Claude 产出；不触发付费 Anthropic API。

输入：

- `knowledge/results/rentahuman/stage2a-copilot-20261022.json`（原提交 `52c125b6ffc3150e38de0cea692a164dfc2d68af`），原字节 SHA256 `0cbec4aca41f72f82181d878e8c50e3908a5da9c7d07c54d62af273e765b7c05`。
- `knowledge/results/rentahuman/stage2a-controller-review-20261022.json`。
- `knowledge/results/rentahuman/mcp-package-review-20261022.json`。
- 千问结果预期路径 `knowledge/results/qwen-dispatch/QWEN-RAH-S2A-REVIEW-20261022.json`；文件未产生/调用失败就明确写尚缺复核，不假设已成功。

输出：`knowledge/results/rentahuman/stage2a-claude-audit-20261022.md`，分支+PR。

验收：注明 `author_provider`、客户端、读取提交、各证据哈希、结论范围。重点核对：CN/广州预演的拒绝与美国补测不能混为一项；官方包启动自动绑定身份的实际请求和结果是否留证；Key配置与真实鉴权是否分开；摄影搜索零条和城市搜索20条是否冲突；模型费、工具费、USDC付款分别记账。不能因模型写“passed”而忽略原始平台拒绝。

禁止：真钱单、充值、身份绑定/解绑、改Key、钱包签名、变更投票席、代别人接单、改写原执行者回执。没有原生 Claude 回执前，只能写本卡已入库待接单。此次不扩大到阶段 2B。
