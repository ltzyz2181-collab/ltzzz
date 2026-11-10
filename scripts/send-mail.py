#!/usr/bin/env python3
"""Send one email through SMTP, driven entirely by environment variables.

Why this exists: the LTZZZ seats coordinate by mail, but no seat machine has a
mail client or mail credential. GitHub Actions is the only place a credential
can be held without baking it into the repository, so this script is the send
path: it reads MAIL_HOST / MAIL_USER / MAIL_PASS from the runner environment,
never prints them, and reads the body from a tracked file so the exact bytes
that were reviewed are the bytes that get sent.

Fail-closed rules:
  - missing host/user/pass   -> refuse, exit 2, no partial send
  - missing body file        -> refuse, exit 3
  - any SMTP/auth error      -> exit 4, never reported as sent
  - success is printed only after the server accepted the message
"""

import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

REQUIRED = ("MAIL_HOST", "MAIL_USER", "MAIL_PASS")


def die(code, message):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(code)


def main():
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        die(2, "缺少凭据：" + ", ".join(missing) + "（不发送，不降级为日志）")

    to = os.environ.get("MAIL_TO", "").strip()
    subject = os.environ.get("MAIL_SUBJECT", "").strip()
    body_path = os.environ.get("MAIL_BODY_PATH", "").strip()
    if not to or "@" not in to:
        die(2, "MAIL_TO 未设置或不是有效地址")
    if not subject:
        die(2, "MAIL_SUBJECT 未设置")
    if not body_path:
        die(2, "MAIL_BODY_PATH 未设置")

    path = Path(body_path)
    if not path.is_file():
        die(3, f"正文文件不存在：{body_path}")
    body = path.read_text(encoding="utf-8")
    if not body.strip():
        die(3, f"正文文件为空：{body_path}")

    msg = EmailMessage()
    msg["From"] = os.environ["MAIL_USER"]
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    port = int(os.environ.get("MAIL_PORT", "465"))
    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL(os.environ["MAIL_HOST"], port, context=context, timeout=30) as server:
            server.login(os.environ["MAIL_USER"], os.environ["MAIL_PASS"])
            server.send_message(msg)
    except Exception as exc:  # noqa: BLE001 - any failure means not sent
        die(4, f"发送失败：{type(exc).__name__}: {exc}")

    print(f"SENT to={to} bytes={len(body.encode('utf-8'))} subject={subject}")


if __name__ == "__main__":
    main()
