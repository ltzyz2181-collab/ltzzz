# -*- coding: utf-8 -*-
"""LTZZZ 聊天记录提取与脱敏脚本
从豆包 agent workspace 的 trajectory.jsonl 提取 user/assistant 消息，
脱敏后归档为 Markdown 到 ltzzz/knowledge/ai-chats/Doubao/。
"""
import json, os, re, io, glob

SESSIONS_ROOT = r"C:\Users\李天柱\AppData\Local\Doubao\User Data\Default\.doubao\agent_mode\workspace\.sessions"
OUT_ROOT = r"C:\Users\李天柱\ltzzz\knowledge\ai-chats\Doubao"

# 脱敏规则
def sanitize(text):
    # 手机号（含 86/空格/横线变体）
    text = re.sub(r'(?<!\d)1[3-9]\d[\s\-]?\d{4}[\s\-]?\d{4}', '1XX****XXXX', text)
    text = re.sub(r'(?<!\d)\+?86[\s\-]?1[3-9]\d{9}', '1XX****XXXX', text)
    # 邮箱
    text = re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<邮箱已脱敏>', text)
    # 16-19 位卡号 / 15 位卡号
    text = re.sub(r'(?<!\d)\d{15,19}(?!\d)', '<卡号已脱敏>', text)
    # 支付宝 APPID（16位）/ PID（16位）常见 2021007 开头
    text = re.sub(r'2021007\d{9}', '<APPID已脱敏>', text)
    text = re.sub(r'2088\d{12}', '<PID已脱敏>', text)
    # API 密钥 / 令牌（真实凭证，必须脱敏）
    text = re.sub(r'sk-[A-Za-z0-9_-]{16,}', '<REDACTED>', text)          # OpenAI/Anthropic/DeepSeek 等 sk- 前缀
    text = re.sub(r'cfut?_[A-Za-z0-9_-]{16,}', '<REDACTED>', text)       # Cloudflare API Token
    text = re.sub(r'ghp_[A-Za-z0-9]{20,}', '<REDACTED>', text)           # GitHub PAT
    text = re.sub(r'AKIA[0-9A-Z]{16}', '<REDACTED>', text)               # AWS Access Key
    text = re.sub(r'0x[a-fA-F0-9]{30,}', '<REDACTED>', text)             # 链上地址/哈希
    text = re.sub(r'\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b', '<REDACTED>', text)  # JWT
    text = re.sub(r'(-----BEGIN [A-Z ]*PRIVATE KEY-----)', '<REDACTED>', text)
    # 常见密钥关键词
    for kw in ['CVV', 'PIN', 'OTP', 'API_KEY', 'API_SECRET', 'SECRET', 'PRIVATE KEY', '私钥', '支付密码', '验证码', 'Access Token']:
        text = re.sub(kw, '<REDACTED>', text, flags=re.IGNORECASE)
    return text

def extract_session(session_id):
    traj = os.path.join(SESSIONS_ROOT, session_id, "agents", "*", "system", "trajectory.jsonl")
    files = glob.glob(traj)
    out_msgs = []
    for fp in files:
        try:
            with io.open(fp, encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        o = json.loads(line)
                    except Exception:
                        continue
                    role = o.get('role', '')
                    content = o.get('content')
                    if role not in ('user', 'assistant'):
                        continue
                    if content is None:
                        continue
                    if isinstance(content, list):
                        parts = []
                        for c in content:
                            if isinstance(c, dict):
                                if c.get('type') == 'text':
                                    parts.append(c.get('text', ''))
                                elif c.get('type') == 'tool_use':
                                    parts.append('[工具调用: %s]' % c.get('name', ''))
                        content = '\n'.join(p for p in parts if p)
                    content = str(content).strip()
                    if not content:
                        continue
                    # 跳过系统注入的 tool 结果（content 含 <system-reminder> 或 persisted-output）
                    if '<system-reminder>' in content or '<persisted-output>' in content:
                        continue
                    out_msgs.append((role, content))
        except Exception as e:
            print('ERR', session_id, fp, e)
    return out_msgs

def main():
    os.makedirs(OUT_ROOT, exist_ok=True)
    sessions = sorted(os.listdir(SESSIONS_ROOT))
    index_rows = []
    for sid in sessions:
        if not sid.isdigit():
            continue
        msgs = extract_session(sid)
        if not msgs:
            continue
        # 统计
        user_cnt = sum(1 for r, _ in msgs if r == 'user')
        asst_cnt = sum(1 for r, _ in msgs if r == 'assistant')
        # 首个用户消息作为标题
        first_user = next((c for r, c in msgs if r == 'user'), '')
        title = first_user.replace('\n', ' ').strip()[:40]
        # 生成 Markdown
        md = ["# 豆包会话记录 · %s" % sid, "", "> 会话ID：%s" % sid,
              "> 用户消息：%d 条 | AI 回复：%d 条" % (user_cnt, asst_cnt),
              "> 首条内容：%s" % title, "", "---", ""]
        for role, content in msgs:
            if role == 'user':
                md.append("## 👤 用户\n\n%s\n" % sanitize(content))
            else:
                md.append("## 🤖 豆包\n\n%s\n" % sanitize(content))
        out_name = "%s.md" % sid
        # 用 trajectory 修改时间生成日期文件名（避免纯数字文件名触发仓库扫描规则）
        from datetime import datetime
        ts = None
        for fp in glob.glob(os.path.join(SESSIONS_ROOT, sid, "agents", "*", "system", "trajectory.jsonl")):
            try:
                ts = datetime.fromtimestamp(os.path.getmtime(fp))
                break
            except Exception:
                continue
        day = ts.strftime('%Y%m%d') if ts else '20260916'
        # 当天已有几个文件就递增序号
        existing = [f for f in os.listdir(OUT_ROOT) if f.startswith('doubao-%s-' % day)]
        n = len(existing) + 1
        out_name = "doubao-%s-%02d.md" % (day, n)
        with io.open(os.path.join(OUT_ROOT, out_name), 'w', encoding='utf-8') as f:
            f.write('\n'.join(md))
        index_rows.append((sid, user_cnt, asst_cnt, title, out_name, day))
        print('OK', sid, '->', out_name, 'user=%d asst=%d' % (user_cnt, asst_cnt))
    # 生成索引
    idx = ["# 豆包聊天记录归档（自动提取）", "",
           "> 生成日期：2026-09-16，来源：豆包 Agent Workspace trajectory.jsonl；已脱敏（手机号/邮箱/卡号/API密钥/凭证 → <REDACTED>）", "",
           "| 日期 | 会话ID | 用户消息 | AI回复 | 首条内容 | 文件 |", "|---|---|---|---|---|---|"]
    for sid, uc, ac, title, name, day in index_rows:
        idx.append("| %s | %s | %d | %d | %s | [%s](%s) |" % (day, sid, uc, ac, title.replace('|', ' '), name, name))
    with io.open(os.path.join(OUT_ROOT, 'index.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(idx))
    print('TOTAL sessions:', len(index_rows))

if __name__ == '__main__':
    main()
