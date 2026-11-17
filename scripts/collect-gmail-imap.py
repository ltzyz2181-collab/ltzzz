#!/usr/bin/env python3
"""Gmail 全箱只读采集（IMAP 应用专用密码通道）。

背景：2026-11-17 复测，云主机到 googleapis/mail.google.com 的 HTTPS 全部 000，
但 imap.gmail.com:993 的 TLS 握手正常，因此全箱读取改走 IMAP + 应用专用密码。

纪律：
- 只读（readonly SELECT / BODY.PEEK），不写信、不标已读、不删邮件。
- 正文永不落盘：只保留 id、日期、发件域、短标题、标题哈希、未读标记。
- 只保留 LTZZZ 项目渠道的发件域标题；其余私人邮件只计数、不留标题（GPT 裁决 2026-11-17 §二.4）。
- 金额与令牌类字符串在短标题里一律替换为占位符。
- 凭据只从环境变量读，绝不写进仓库；缺失时 fail-closed 写原因。

用法：
  GMAIL_IMAP_USER=... GMAIL_IMAP_APP_PASSWORD=... \
    python3 scripts/collect-gmail-imap.py
"""
import datetime
import email
import hashlib
import imaplib
import json
import os
import re
import sys

OUT_DIR = 'knowledge/results/deep-superagent/mail-fullbox'
OUT = os.path.join(OUT_DIR, 'latest.json')
WINDOW_DAYS = int(os.environ.get('GMAIL_LOOKBACK_DAYS', '30'))
MAX_WINDOW_MESSAGES = int(os.environ.get('GMAIL_MAX_WINDOW_MESSAGES', '2500'))
USER = os.environ.get('GMAIL_IMAP_USER', 'ltzyz2181@gmail.com')
PASSWORD = os.environ.get('GMAIL_IMAP_APP_PASSWORD', '')

AMOUNT = re.compile(r'[0-9][0-9.,]*\s*(?:UT|USDT|CNY|USD|EUR|ETH|BTC|元|美元|港币)', re.I)
# 符号在前的金额（¥9.90 / $12.34 / €99）单独一条：上面的正则只认「数字在前」的写法。
AMOUNT_SYMBOL = re.compile(r'[¥\u00a5$\uff04\u20ac\u00a3]\s*[0-9][0-9.,]*')
TOKEN = re.compile(r'[A-Za-z0-9_\-]{28,}')
# GPT 裁决 GPT-LTZZZ-AUTONOMY-RULING-20261117-01 §二.4：不将无关个人信息纳入项目记录。
# 只允许这些项目渠道的发件域把「短标题」落盘；其余邮件仅计入 project_unrelated_count，标题直接丢弃。
PROJECT_DOMAINS = {
    'agent.qq.com',            # Agent Mail 席位通道
    'github.com',              # 仓库 / CI 通知
    'weixin.qq.com',           # 微信公众平台
    'mp.weixin.qq.com',
    'wechat.com',
    'tencent.com',
    'cloud.tencent.com',
    'x.ai',                    # Grok 席位
}

DISPATCH = re.compile(r'(派单|裁决|待决|待处置|待办|未完成|缺口|pending|action required)', re.I)
CLOSED = re.compile(r'(验收通过|已合并|已部署|部署完成|已闭环|已收口|已修复并部署|already merged|accepted)', re.I)
OPENISH = re.compile(r'(等待|待补|待回|待裁决|阻塞|未回|缺口|尚未|未完成|请据此|请回)', re.I)


def sha256(text):
    return hashlib.sha256(text.encode('utf-8', 'surrogateescape')).hexdigest()


def redact(subject):
    s = AMOUNT.sub('<amount>', subject or '')
    s = AMOUNT_SYMBOL.sub('<amount>', s)
    s = TOKEN.sub('<token>', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s[:60]


def status_of(subject):
    closed = bool(CLOSED.search(subject))
    openish = bool(OPENISH.search(subject))
    if closed and not openish:
        return 'closed'
    if openish:
        return 'open'
    return 'unknown'


def write(payload):
    os.makedirs(OUT_DIR, exist_ok=True)
    # 上一次成功的产物另存一份：失败重跑不得把可核验的 ok 结果覆盖成废态。
    if os.getenv('OUT', OUT) == OUT and os.path.exists(OUT):
        try:
            prev = json.load(open(OUT, encoding='utf-8'))
        except Exception:  # noqa: BLE001
            prev = None
        if prev and prev.get('status') == 'ok':
            with open(os.path.join(OUT_DIR, 'last-ok.json'), 'w', encoding='utf-8') as fh:
                json.dump(prev, fh, ensure_ascii=False, indent=1)
                fh.write('\n')
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
        fh.write('\n')


def base(status_code, **extra):
    payload = {
        'schema': 'ltzzz.mail-fullbox.v1',
        'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'mailbox': USER,
        'lookback_days': WINDOW_DAYS,
        'status': status_code,
        'provider': 'gmail_imap',
        'read_only': True,
        'bodies_persisted': False,
        'count': 0,
        'open_count': 0,
        'messages': [],
    }
    payload.update(extra)
    return payload


def die(reason, **extra):
    write(base(reason, **extra))
    print(reason)


def main():
    if not PASSWORD:
        die('creds_missing', required_env=['GMAIL_IMAP_USER', 'GMAIL_IMAP_APP_PASSWORD'],
            note='IMAP app password absent; fail-closed, no mailbox read attempted')
        return 3

    # 云主机到 imap.gmail.com 偶发 TCP 握手超时，按有限退避重试三次。
    import socket
    import time
    conn = None
    attempts = []
    for i in range(3):
        try:
            conn = imaplib.IMAP4_SSL('imap.gmail.com', 993, timeout=45)
            conn.login(USER, PASSWORD)
            break
        except Exception as exc:  # noqa: BLE001
            attempts.append({'attempt': i + 1, 'error': type(exc).__name__, 'detail': str(exc)[:120]})
            conn = None
            if i < 2:
                time.sleep(30 if i == 0 else 90)
    if conn is None:
        die('imap_login_failed', retries=attempts,
            note='transient egress timeout or credential rejected; no mailbox read performed')
        return 3

    try:
        conn.select('INBOX', readonly=True)
        typ, data = conn.status('INBOX', '(MESSAGES UNSEEN)')
        status_raw = data[0].decode('utf-8', 'replace') if data and data[0] else ''
        total = int(re.search(r'MESSAGES (\d+)', status_raw).group(1))
        unseen = int(re.search(r'UNSEEN (\d+)', status_raw).group(1))

        since = (datetime.date.today() - datetime.timedelta(days=WINDOW_DAYS)).strftime('%d-%b-%Y')
        typ, data = conn.search(None, 'SINCE', since)
        ids = data[0].split() if data and data[0] else []
        ids = ids[-MAX_WINDOW_MESSAGES:]

        # 批量 FETCH：一次取 100 封的头部，避免逐封往返被 Gmail 限速。
        messages = []
        unrelated = 0
        batch = 100
        for start in range(0, len(ids), batch):
            chunk = ids[start:start + batch]
            rng = b'%s:%s' % (chunk[0], chunk[-1])
            typ, fetched = conn.fetch(rng, '(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)] FLAGS)')
            if typ != 'OK' or not fetched:
                continue
            for item in fetched:
                if not isinstance(item, tuple) or len(item) < 2:
                    continue
                meta, raw_head = item[0], item[1]
                msg = email.message_from_bytes(raw_head)
                subject = msg.get('Subject', '') or ''
                try:
                    subject = str(email.header.make_header(email.header.decode_header(subject)))
                except Exception:  # noqa: BLE001
                    pass
                sender = msg.get('From', '') or ''
                domain = re.search(r'@([^\s>]+)', sender)
                unread = b'\\Seen' not in (meta if isinstance(meta, bytes) else b'')
                if (domain.group(1) if domain else None) not in PROJECT_DOMAINS:
                    unrelated += 1
                    continue
                messages.append({
                    'ref': sha256(msg.get('Message-ID', '') or subject)[:16],
                    'date': (msg.get('Date', '') or '')[:40],
                    'from_domain': domain.group(1) if domain else None,
                    'subject_short': redact(subject),
                    'subject_sha256': sha256(subject),
                    'unread': unread,
                    'status': status_of(subject),
                    'has_dispatch_wording': bool(DISPATCH.search(subject)),
                })

        open_count = sum(1 for m in messages if m['status'] == 'open' or m['unread'])
        dispatch_count = sum(1 for m in messages if m['has_dispatch_wording'])
        write(base(
            'ok',
            count=len(messages),
            open_count=open_count,
            messages=messages,
            full_box_total=total,
            full_box_unseen=unseen,
            window_since=since,
            window_truncated=len(ids) >= MAX_WINDOW_MESSAGES,
            dispatch_wording_count=dispatch_count,
            channel_check={'imap_tls': 'ok', 'https_google': 'unreachable_from_vm'},
            subject_scope='project_domains_only',
            project_unrelated_count=unrelated,
            contains_mail_body=False,
        ))
        print('ok count=%d open=%d full_box=%d unseen=%d dispatch_wording=%d unrelated_dropped=%d'
              % (len(messages), open_count, total, unseen, dispatch_count, unrelated))
        return 0
    finally:
        try:
            conn.logout()
        except Exception:  # noqa: BLE001
            pass


if __name__ == '__main__':
    sys.exit(main())
