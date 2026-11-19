#!/usr/bin/env python3
"""每日日报发信（QQ SMTP over TLS）。

纪律：
- 只读日报生成的 email-<date>.meta.json / email-<date>.txt，不接受任意正文文件。
- 凭据只从环境变量读（MAIL_SMTP_AUTH_CODE），绝不写进仓库、日志或回执。
- 缺凭据、缺正文、meta 结构不对时 fail-closed，写清 reason 并以非 0 退出。
- 回执只落主题/正文哈希、收件人数量与域、SMTP 响应码，不落正文原文、
  不落收件人完整地址、不落授权码。
- AUTOLOOP_SEND_MAIL=false/0 时明确写 skipped_by_switch，不假装已发送。
"""
import argparse
import datetime
import email.message
import email.utils
import hashlib
import json
import os
import re
import smtplib
import sys
import traceback

SCHEMA = 'ltzzz.mail-send.v1'
META_SCHEMA = 'ltzzz.deep-superagent.email-meta.v1'
DEFAULT_HOST = 'smtp.qq.com'
DEFAULT_PORT = 465
TOKEN = re.compile(r'[A-Za-z0-9_\-]{28,}')
DOMAIN = re.compile(r'@([A-Za-z0-9.-]+)')


def sha256_text(text):
    return hashlib.sha256(text.encode('utf-8', 'surrogateescape')).hexdigest()


def sha256_bytes(raw):
    return hashlib.sha256(raw).hexdigest()


def parse_recipients(raw):
    return [item.strip() for item in str(raw or '').split(',') if item.strip()]


def recipient_fingerprint(recipients):
    """收件人只保留数量、域和整体哈希，不落完整地址。"""
    domains = sorted({match.group(1).lower() for addr in recipients
                      for match in [DOMAIN.search(addr)] if match})
    return {
        'recipients_count': len(recipients),
        'recipient_domains': domains,
        'recipients_sha256': sha256_text(','.join(sorted(addr.lower() for addr in recipients))),
    }


def build_message(from_addr, recipients, subject, body):
    message = email.message.EmailMessage()
    message['From'] = from_addr
    message['To'] = ', '.join(recipients)
    message['Subject'] = subject
    message['Date'] = email.utils.formatdate(localtime=False)
    message['Message-ID'] = email.utils.make_msgid(domain=from_addr.split('@')[-1] or 'ltzzz.local')
    message.set_content(body)
    return message


def load_inputs(meta_path, body_path=None):
    with open(meta_path, encoding='utf-8') as fh:
        meta = json.load(fh)
    if meta.get('schema') != META_SCHEMA:
        raise ValueError('invalid_email_meta_schema')
    subject = str(meta.get('subject') or '').strip()
    if not subject or '\n' in subject or '\r' in subject:
        raise ValueError('invalid_email_subject')
    if meta.get('contains_mail_body'):
        raise ValueError('email_meta_claims_mail_body')
    target = body_path or meta.get('body_file')
    if not target:
        raise ValueError('missing_body_file')
    if not os.path.isabs(target):
        target = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), target)
    with open(target, 'rb') as fh:
        raw = fh.read()
    body = raw.decode('utf-8')
    if not body.strip():
        raise ValueError('empty_body')
    return meta, subject, body, raw, target


def receipt(status, **extra):
    payload = {
        'schema': SCHEMA,
        'channel': 'smtp_tls',
        'status': status,
        'at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'secrets_included': False,
        'body_persisted': False,
        'contains_mail_body': False,
    }
    payload.update(extra)
    return payload


def write_receipt(path, payload):
    if path:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
            fh.write('\n')


def send_via_smtp(host, port, user, password, message, timeout=45, smtp_factory=None):
    factory = smtp_factory or smtplib.SMTP_SSL
    conn = None
    try:
        conn = factory(host, port, timeout=timeout)
        conn.login(user, password)
        code, detail = conn.send_message(message)
        return {'status': 'sent', 'smtp_code': int(code),
                'smtp_detail': str(detail or '')[:120], 'smtp_host': host, 'smtp_port': int(port)}
    finally:
        if conn is not None:
            try:
                conn.quit()
            except Exception:  # noqa: BLE001
                pass


def run(meta_path, body_path=None, receipt_path=None, dry_run=False, env=None, smtp_factory=None):
    env = dict(os.environ if env is None else env)
    if env.get('AUTOLOOP_SEND_MAIL', 'true').strip().lower() in {'0', 'false', 'off', 'no'}:
        payload = receipt('skipped_by_switch', reason='AUTOLOOP_SEND_MAIL disabled; no SMTP connection attempted')
        write_receipt(receipt_path, payload)
        return 0, payload

    host = env.get('MAIL_SMTP_HOST', DEFAULT_HOST).strip()
    try:
        port = int(env.get('MAIL_SMTP_PORT', str(DEFAULT_PORT)))
    except ValueError:
        payload = receipt('invalid_input', reason='invalid_smtp_port')
        write_receipt(receipt_path, payload)
        return 2, payload
    user = env.get('MAIL_SMTP_USER', '').strip()
    # 仓库 secrets 里叫 MAIL_SMTP_PASSWORD；保留 MAIL_SMTP_AUTH_CODE 作为显式别名。
    password = env.get('MAIL_SMTP_AUTH_CODE') or env.get('MAIL_SMTP_PASSWORD', '')
    from_addr = env.get('MAIL_FROM', user).strip()
    recipients = parse_recipients(env.get('AUTOLOOP_MAIL_TO') or env.get('MAIL_TO'))

    try:
        meta, subject, body, raw, body_file = load_inputs(meta_path, body_path)
    except Exception as exc:  # noqa: BLE001
        payload = receipt('invalid_input', reason=str(exc)[:160])
        write_receipt(receipt_path, payload)
        return 2, payload

    digest = {
        'subject_sha256': sha256_text(subject),
        'body_sha256': sha256_bytes(raw),
        'body_bytes': len(raw),
        'date': meta.get('date'),
        'counts': meta.get('counts'),
    }
    if dry_run:
        payload = receipt('dry_run', reason='no SMTP connection attempted', **digest)
        write_receipt(receipt_path, payload)
        return 0, payload

    missing = [name for name, value in (
        ('MAIL_SMTP_USER', user), ('MAIL_SMTP_AUTH_CODE', password),
        ('MAIL_FROM', from_addr), ('AUTOLOOP_MAIL_TO', recipients),
    ) if not value]
    if missing:
        payload = receipt('creds_missing', reason='missing required env', required_env=missing, **digest)
        write_receipt(receipt_path, payload)
        return 3, payload

    message = build_message(from_addr, recipients, subject, body)
    base = dict(digest, **recipient_fingerprint(recipients))
    try:
        result = send_via_smtp(host, port, user, password, message, smtp_factory=smtp_factory)
    except Exception as exc:  # noqa: BLE001
        # 回执只记异常类型与消息；traceback 只进 stderr，便于定位而不会把凭据写入仓库。
        traceback.print_exc()
        payload = receipt('failed', reason=type(exc).__name__, detail=str(exc)[:160],
                          smtp_host=host, smtp_port=port, **base)
        write_receipt(receipt_path, payload)
        return 3, payload

    payload = receipt(result.pop('status'), message_id=str(message.get('Message-ID', ''))[:200],
                      subject_preview=TOKEN.sub('<token>', subject)[:80], **base, **result)
    write_receipt(receipt_path, payload)
    return 0, payload


def main(argv=None):
    parser = argparse.ArgumentParser(description='LTZZZ daily report SMTP sender')
    parser.add_argument('--meta', required=True)
    parser.add_argument('--body-file')
    parser.add_argument('--receipt')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args(argv)
    code, payload = run(args.meta, args.body_file, args.receipt, args.dry_run)
    # 只打印状态与哈希，绝不打印授权码或正文。
    print(json.dumps({key: payload.get(key) for key in (
        'status', 'reason', 'smtp_code', 'message_id', 'body_sha256', 'recipients_count')}, ensure_ascii=False))
    return code


if __name__ == '__main__':
    sys.exit(main())
