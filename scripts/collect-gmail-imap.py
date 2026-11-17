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

Phase 2（GPT-LTZZZ-AUTONOMY-RULING-20261117-01 §二.2/§二.3）：
- 先只取邮件头；仅对命中 LTZZZ 项目规则的邮件用 BODY.PEEK[TEXT] 按需读正文。
- 正文不做任何持久化：只落 body_sha256/字节数/字符数与从中提取的 Task ID、
  decision_id、裁决词——原文在函数返回时即丢弃。
- 读取上限（GMAIL_MAX_BODY_READS / GMAIL_MAX_BODY_BYTES）与失败逐封隔离：
  单封读取失败只记 body_status=fetch_failed，不猜测内容，不影响其他邮件。
- 写盘前有 assert_privacy 自检：出现长文本或多行文本直接拒绝落盘。

用法：
  GMAIL_IMAP_USER=... GMAIL_IMAP_APP_PASSWORD=... \
    python3 scripts/collect-gmail-imap.py
"""
import datetime
import email
import email.header
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

# Phase 2 正文按需读取
BODY_ENABLED = os.environ.get('GMAIL_BODY_READ', '1') != '0'
MAX_BODY_READS = int(os.environ.get('GMAIL_MAX_BODY_READS', '50'))
MAX_BODY_BYTES = int(os.environ.get('GMAIL_MAX_BODY_BYTES', '65536'))
BODY_HEADER_FIELDS = '(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID REFERENCES IN-REPLY-TO)] FLAGS)'

AMOUNT = re.compile(r'[0-9][0-9.,]*\s*(?:UT|USDT|CNY|USD|EUR|ETH|BTC|元|美元|港币)', re.I)
# 符号在前的金额（¥9.90 / $12.34 / €99）单独一条：上面的正则只认「数字在前」的写法。
AMOUNT_SYMBOL = re.compile(r'[¥￥$＄€£]\s*[0-9][0-9.,]*')
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
# 裁决席从 Gmail 本人地址来信：只按精确地址放行，不把整个 gmail.com 加入白名单。
PROJECT_SENDERS = {'ltzyz2181@gmail.com'}

DISPATCH = re.compile(r'(派单|裁决|待决|待处置|待办|未完成|缺口|pending|action required)', re.I)
CLOSED = re.compile(r'(验收通过|已合并|已部署|部署完成|已闭环|已收口|已修复并部署|already merged|accepted)', re.I)
OPENISH = re.compile(r'(等待|待补|待回|待裁决|阻塞|未回|缺口|尚未|未完成|请据此|请回)', re.I)
# 仅用于判断「这封邮件是否值得按需读正文」，不参与标题落盘判定。
BODY_MATCH = re.compile(r'(裁决|派单|待决|待处置|待办|未完成|缺口|pending|action required|approval|decision)', re.I)
TASK_ID = re.compile(r'\b[A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)*-\d{8}(?:-[A-Za-z0-9]+)*\b')
DECISION_ID = re.compile(r'\b(?:GPT|LTZZZ)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{8}(?:-\d{1,3})?\b', re.I)
VERDICT_PATTERNS = {
    'return_for_revision': re.compile(r'return_for_revision', re.I),
    'keep_blocked': re.compile(r'keep_blocked', re.I),
    'needs_decision': re.compile(r'needs_decision', re.I),
    'approve_in_scope': re.compile(r'approve_in_scope', re.I),
    'conditional_approve': re.compile(r'conditional_approve', re.I),
    'already_decided': re.compile(r'already_decided', re.I),
}


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


def sender_address(from_header):
    raw = (from_header or '').strip()
    match = re.search(r'<([^>]+)>', raw)
    return (match.group(1) if match else raw).strip().lower()


def thread_root(msg):
    """IMAP 没有 threadId：用 References 根 / In-Reply-To / Message-ID 归并线程。"""
    references = (msg.get('References', '') or '').split()
    root = references[0] if references else ''
    if not root:
        root = (msg.get('In-Reply-To', '') or '').strip()
    if not root:
        root = (msg.get('Message-ID', '') or '').strip()
    return sha256(root)[:16] if root else None


def should_read_body(address, domain, subject):
    """先筛头：只有项目渠道且标题命中项目语义的邮件才允许读正文。"""
    if not BODY_ENABLED:
        return False
    if address not in PROJECT_SENDERS and domain not in PROJECT_DOMAINS:
        return False
    return bool(BODY_MATCH.search(subject or '') or DECISION_ID.search(subject or ''))


def decode_body(raw):
    """把 BODY.PEEK[TEXT] 原始字节转成可分析的纯文本；调用方不得保存返回值。"""
    text = raw.decode('utf-8', 'replace')
    # HTML 邮件：去掉标签但保留文字；标签名限制长度，避免误吞正文。
    text = re.sub(r'<[^<>]{0,200}>', ' ', text)
    # quoted-printable 软换行
    text = re.sub(r'=\r?\n', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def summarize_body(raw):
    """只返回派生字段，绝不返回正文本身。"""
    truncated = len(raw) > MAX_BODY_BYTES
    clipped = raw[:MAX_BODY_BYTES]
    text = decode_body(clipped)
    task_ids = sorted(set(TASK_ID.findall(text)))[:10]
    decision_ids = sorted({m.group(0).upper() for m in DECISION_ID.finditer(text)})[:10]
    verdicts = sorted(name for name, pattern in VERDICT_PATTERNS.items() if pattern.search(text))
    return {
        'body_status': 'ok',
        'body_read': True,
        'body_method': 'BODY.PEEK[TEXT]',
        'body_bytes': len(raw),
        'body_chars': len(text),
        'body_sha256': sha256(text),
        'body_truncated': truncated,
        'body_task_ids': task_ids,
        'body_decision_ids': decision_ids,
        'body_verdicts': verdicts,
    }


def fetch_body_summary(conn, seq):
    """单封按需读正文。失败由调用方隔离，不在此吞掉成成功。"""
    typ, data = conn.fetch(str(seq), '(BODY.PEEK[TEXT])')
    if typ != 'OK' or not data:
        return {'body_status': 'fetch_failed'}
    raw = b''
    for item in data:
        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], bytes):
            raw += item[1]
    if not raw:
        return {'body_status': 'empty'}
    return summarize_body(raw)


def seq_of(meta):
    match = re.match(rb'\s*(\d+)\b', meta or b'')
    return int(match.group(1)) if match else None


def assert_privacy(payload):
    """写盘前自检：正文/多行长文本一律不允许进入 ledger。"""
    forbidden_keys = {'body', 'body_text', 'text', 'raw', 'html', 'snippet'}
    max_len = 320

    def walk(value, path):
        if isinstance(value, str):
            if len(value) > max_len:
                raise AssertionError('string_too_long:%s' % path)
            if '\n' in value or '\r' in value:
                raise AssertionError('multiline_string:%s' % path)
        elif isinstance(value, dict):
            for key, item in value.items():
                if key in forbidden_keys:
                    raise AssertionError('forbidden_key:%s.%s' % (path, key))
                walk(item, '%s.%s' % (path, key))
        elif isinstance(value, (list, tuple)):
            for index, item in enumerate(value):
                walk(item, '%s[%d]' % (path, index))

    walk(payload, '$')


def write(payload):
    assert_privacy(payload)
    os.makedirs(OUT_DIR, exist_ok=True)
    # 上一次成功的产物另存一份：失败重跑不得把可核验的 ok 结果覆盖成废态。
    if os.getenv('OUT', OUT) == OUT and os.path.exists(OUT):
        try:
            with open(OUT, encoding='utf-8') as fh:
                prev = json.load(fh)
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
        'contains_mail_body': False,
        'count': 0,
        'open_count': 0,
        'messages': [],
    }
    payload.update(extra)
    return payload


def die(reason, **extra):
    write(base(reason, **extra))
    print(reason)


def status_counts(conn):
    typ, data = conn.status('INBOX', '(MESSAGES UNSEEN)')
    raw = data[0].decode('utf-8', 'replace') if data and data[0] else ''
    total = re.search(r'MESSAGES (\d+)', raw)
    unseen = re.search(r'UNSEEN (\d+)', raw)
    return (int(total.group(1)) if total else None, int(unseen.group(1)) if unseen else None, typ)


def fetch_headers(conn, ids):
    """批量取头，返回 ([(seq, message_object, meta_bytes)], failed_batches)。"""
    out = []
    failed = 0
    batch = 100
    for start in range(0, len(ids), batch):
        chunk = ids[start:start + batch]
        rng = b'%s:%s' % (chunk[0], chunk[-1])
        typ, fetched = conn.fetch(rng, BODY_HEADER_FIELDS)
        if typ != 'OK' or not fetched:
            failed += 1
            continue
        for item in fetched:
            if not isinstance(item, tuple) or len(item) < 2:
                continue
            meta, raw_head = item[0], item[1]
            out.append((seq_of(meta), email.message_from_bytes(raw_head), meta))
    return out, failed


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
        try:
            conn.select('INBOX', readonly=True)
            total, unseen, status_typ = status_counts(conn)

            since = (datetime.date.today() - datetime.timedelta(days=WINDOW_DAYS)).strftime('%d-%b-%Y')
            typ, data = conn.search(None, 'SINCE', since)
            if typ != 'OK':
                die('imap_search_failed', search_status=typ,
                    note='read-only search rejected; no headers fetched')
                return 3
        except Exception as exc:  # noqa: BLE001
            die('imap_select_failed', error_class=type(exc).__name__, detail=str(exc)[:160],
                note='read-only SELECT/STATUS failed; no mailbox content read')
            return 3

        ids = data[0].split() if data and data[0] else []
        ids = ids[-MAX_WINDOW_MESSAGES:]

        messages = []
        unrelated = 0
        headers, header_batch_failures = fetch_headers(conn, ids)
        for seq, msg, meta in headers:
            subject = msg.get('Subject', '') or ''
            try:
                subject = str(email.header.make_header(email.header.decode_header(subject)))
            except Exception:  # noqa: BLE001
                pass
            sender = msg.get('From', '') or ''
            address = sender_address(sender)
            domain_match = re.search(r'@([^\s>]+)', sender)
            domain = domain_match.group(1).lower() if domain_match else None
            if address not in PROJECT_SENDERS and domain not in PROJECT_DOMAINS:
                unrelated += 1
                continue
            message_id = msg.get('Message-ID', '') or subject
            record = {
                'ref': sha256(message_id)[:16],
                'date': (msg.get('Date', '') or '')[:40],
                'from_domain': domain,
                'subject_short': redact(subject),
                'subject_sha256': sha256(subject),
                # 与头同批返回 FLAGS；只读判定，不发 STORE。
                'unread': b'\\Seen' not in (meta if isinstance(meta, bytes) else b''),
                'status': status_of(subject),
                'has_dispatch_wording': bool(DISPATCH.search(subject)),
                'thread_id': thread_root(msg),
                'task_ids': sorted(set(TASK_ID.findall(subject)))[:10],
                'body_status': 'not_selected',
            }
            messages.append((seq, record, subject, address, domain))

        body_reads = 0
        body_skipped_unmatched = 0
        body_failed = 0
        for seq, record, subject, address, domain in messages:
            if not should_read_body(address, domain, subject):
                body_skipped_unmatched += 1
                continue
            if body_reads >= MAX_BODY_READS:
                record['body_status'] = 'not_selected_cap'
                continue
            body_reads += 1
            try:
                record.update(fetch_body_summary(conn, seq))
            except Exception as exc:  # noqa: BLE001
                body_failed += 1
                record['body_status'] = 'fetch_failed'
                record['body_error_class'] = type(exc).__name__
            # 正文原文只存在于 fetch_body_summary 的局部变量中，函数返回即丢弃。

        exported = [record for _, record, _, _, _ in messages]
        open_count = sum(1 for m in exported if m['status'] == 'open' or m['unread'])
        dispatch_count = sum(1 for m in exported if m['has_dispatch_wording'])
        write(base(
            'ok',
            count=len(exported),
            open_count=open_count,
            messages=exported,
            full_box_total=total,
            full_box_unseen=unseen,
            window_since=since,
            window_truncated=len(ids) >= MAX_WINDOW_MESSAGES,
            header_batch_failures=header_batch_failures,
            dispatch_wording_count=dispatch_count,
            channel_check={'imap_tls': 'ok', 'https_google': 'unreachable_from_vm'},
            subject_scope='project_domains_only',
            project_unrelated_count=unrelated,
            body_scope='project_matched_only',
            body_reads=body_reads,
            body_skipped_unmatched=body_skipped_unmatched,
            body_failed=body_failed,
            body_read_enabled=BODY_ENABLED,
            body_max_reads=MAX_BODY_READS,
            body_max_bytes=MAX_BODY_BYTES,
            body_method='BODY.PEEK[TEXT]',
            contains_mail_body=False,
        ))
        print('ok count=%d open=%d full_box=%s unseen=%s dispatch_wording=%d unrelated_dropped=%d body_reads=%d body_failed=%d'
              % (len(exported), open_count, total, unseen, dispatch_count, unrelated, body_reads, body_failed))
        return 0
    finally:
        try:
            conn.logout()
        except Exception:  # noqa: BLE001
            pass


if __name__ == '__main__':
    sys.exit(main())
