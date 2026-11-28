# 原厂 Deep 只读邮箱通道（2026-11-27）

## 决定

owner 2026-11-27：把 IMAP 只读凭据交给原厂 Deep，邮件读取与分诊由原厂模型自己完成。

## 事实（实测）

- `qingqizhu6502@agent.qq.com`（Agent Mail）**不支持 IMAP**：`imap.qq.com` 直接登录返回
  `AUTHENTICATIONFAILED`，该箱只有 `agently-cli` 或网页会话两条路。
- `306122054@qq.com`（共享箱）IMAP 可用（INBOX 3137 封），项目邮件与各席位回执都镜像到这里。
- 因此本轮把 Deep 的只读通道接在共享箱上；Agent Mail 仍走网页/CLI，不冒充已接。

## 实现

`scripts/deep-mail-agent.py`：

1. 只读连接（`readonly=True`），全程 `BODY.PEEK`，不标已读、不删除、不移动。
2. 第 1 次模型调用：Deep 从邮件头里自己挑要读正文的 10 封。
3. 本地按它挑的序号读正文（≤3000 字/封，正文不落盘，只存 sha256）。
4. 第 2 次模型调用：Deep 输出分类 JSON（A/B/C/D/E）、席位、动作、待裁决。
5. 无发信能力；不发邮件、不改邮箱状态。

凭据只从环境变量读取，不进仓库、不进日志、不打印。
调度：`.github/workflows/deep-mail-read.yml`（每日 06:25 Asia/Shanghai + 手动触发），
使用仓库 secrets `QQ_IMAP_USER` / `QQ_IMAP_PASSWORD` / `DEEPSEEK_API_KEY`。

## 首次实跑（2026-11-27）

- 邮箱 `306122054@qq.com`，窗口 7 天，20 封；Deep 自选读了 10 封正文。
- 2 次调用合计 8668 tokens，模型 `deepseek-v4-pro`。
- 结果：A_closed 10 / B_deploy 6 / C_gpt 4。
- 产物：`knowledge/results/deep-superagent/mail-imap-deep-2026-11-27.json`。

## 边界

- Agent Mail 收件箱仍未接 IMAP；要覆盖需 `agently-cli` 会话（凭据族，另行裁决）。
- 新建邮箱不是必需项：共享箱已能承接项目邮件；新建需手机验证，无法自动完成。
- 资金、退款终态、签名、私钥、钱包零动作。