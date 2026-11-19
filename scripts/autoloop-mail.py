#!/usr/bin/env python3
"""Autoloop mail helper: read headers (IMAP, read-only) and send one L1 digest (SMTP).

Fail-closed: missing credentials or transport faults are reported as status values and
exit 0, because a mail outage must not stop the rest of the loop. Nothing here prints a
password, and the reader never marks messages as seen.
"""
import argparse
import datetime
import email
import email.utils
import hashlib
import imaplib
import json
import os
import smtplib
import ssl
from email.message import EmailMessage

def _out(payload):
    print(json.dumps(payload, ensure_ascii=False))

def _imap_env():
    return {
        "host": os.environ.get("MAIL_IMAP_HOST", "imap.gmail.com"),
        "port": int(os.environ.get("MAIL_IMAP_PORT", "993")),
        "user": os.environ.get("MAIL_ADDRESS", ""),
        "password": os.environ.get("MAIL_PASSWORD", ""),
    }

def _smtp_env():
    return {
        "host": os.environ.get("MAIL_SMTP_HOST", "smtp.qq.com"),
        "port": int(os.environ.get("MAIL_SMTP_PORT", "465")),
        "user": os.environ.get("MAIL_SMTP_USER", os.environ.get("MAIL_ADDRESS", "")),
        "password": os.environ.get("MAIL_SMTP_PASSWORD", os.environ.get("MAIL_PASSWORD", "")),
    }

def read_headers(days, limit, out):
    c = _imap_env()
    if not c["user"] or not c["password"]:
        return {"status": "blocked_missing_credentials", "required": ["MAIL_ADDRESS", "MAIL_PASSWORD"]}
    try:
        box = imaplib.IMAP4_SSL(c["host"], c["port"], ssl_context=ssl.create_default_context(), timeout=25)
        box.login(c["user"], c["password"])
        raw_folder = os.environ.get("MAIL_IMAP_FOLDER", "INBOX")
        folder = raw_folder if (" " not in raw_folder or raw_folder.startswith('"')) else '"%s"' % raw_folder
        typ, _ = box.select(folder, readonly=True)
        if typ != "OK":
            box.logout()
            return {"status": "blocked_imap_select", "detail": raw_folder[:80]}
        since = (datetime.datetime.utcnow() - datetime.timedelta(days=days)).strftime("%d-%b-%Y")
        typ, data = box.search(None, "(SINCE %s)" % since)
        if typ != "OK":
            box.logout()
            return {"status": "blocked_imap_search", "detail": str(data)[:160]}
        ids = (data[0] or b"").split()[-limit:]
        items = []
        for mid in ids:
            typ, parts = box.fetch(mid, "(BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)])")
            raw = b""
            for part in parts:
                if isinstance(part, tuple):
                    raw = part[1]
            msg = email.message_from_bytes(raw)
            items.append({
                "message_id": (msg.get("Message-ID") or "").strip(),
                "from": (msg.get("From") or "").strip()[:200],
                "date": (msg.get("Date") or "").strip()[:80],
                "subject": (msg.get("Subject") or "").strip()[:200],
            })
        box.logout()
        payload = {"status": "ok", "count": len(items), "items": items, "mode": "headers_only_readonly_peek", "folder": raw_folder}
        if out:
            with open(out, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False, indent=2)
        return payload
    except imaplib.IMAP4.error as exc:
        return {"status": "blocked_imap_auth_or_protocol", "detail": str(exc)[:200]}
    except Exception as exc:  # network faults are expected on restricted runners
        return {"status": "blocked_imap_transport", "detail": type(exc).__name__}

def send(subject, body_file, to):
    c = _smtp_env()
    if not c["user"] or not c["password"] or not to:
        return {"status": "blocked_missing_credentials", "required": ["MAIL_SMTP_USER", "MAIL_SMTP_PASSWORD", "recipient"]}
    with open(body_file, encoding="utf-8") as fh:
        body = fh.read()
    msg = EmailMessage()
    msg["From"] = f"LTZZZ 自动循环 <{c['user']}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = email.utils.formatdate(localtime=False)
    msg["Message-ID"] = email.utils.make_msgid(domain="qq.com")
    msg.set_content(body)
    try:
        with smtplib.SMTP_SSL(c["host"], c["port"], timeout=45, context=ssl.create_default_context()) as s:
            s.login(c["user"], c["password"])
            s.send_message(msg)
        return {
            "status": "sent",
            "message_id": msg["Message-ID"],
            "to": to,
            "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        }
    except smtplib.SMTPException as exc:
        return {"status": "failed_smtp", "detail": type(exc).__name__}
    except Exception as exc:
        return {"status": "failed_transport", "detail": type(exc).__name__}

def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    pr = sub.add_parser("read")
    pr.add_argument("--days", type=int, default=2)
    pr.add_argument("--limit", type=int, default=40)
    pr.add_argument("--out", default="")
    ps = sub.add_parser("send")
    ps.add_argument("--subject", required=True)
    ps.add_argument("--body-file", required=True)
    ps.add_argument("--to", required=True)
    a = p.parse_args()
    if a.cmd == "read":
        _out(read_headers(a.days, a.limit, a.out))
    else:
        _out(send(a.subject, a.body_file, a.to))

if __name__ == "__main__":
    main()
