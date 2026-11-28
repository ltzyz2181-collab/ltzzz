#!/usr/bin/env python3
"""Upstream DeepSeek driven, read-only IMAP triage.

The model decides which messages to open; this process performs the IMAP reads
(BODY.PEEK only, never marks messages seen) and then asks the model for a triage
JSON. There is no send capability here, and the password is never printed.
"""
import argparse
import email
import hashlib
import imaplib
import json
import os
import poplib
import re
import ssl
import sys
import urllib.request
from email.header import decode_header, make_header

MAX_BODY = 3000
DEFAULT_MODEL = os.environ.get("DEEPSEEK_MODEL") or "deepseek-v4-pro"


def decode_header_value(raw):
    if raw is None:
        return ""
    try:
        return str(make_header(decode_header(str(raw))))
    except Exception:
        return str(raw)


def message_text(raw_bytes, limit=MAX_BODY):
    msg = email.message_from_bytes(raw_bytes)
    parts = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get("Content-Disposition"):
                try:
                    charset = part.get_content_charset() or "utf-8"
                    parts.append(part.get_payload(decode=True).decode(charset, "replace"))
                except Exception:
                    continue
    else:
        try:
            charset = msg.get_content_charset() or "utf-8"
            parts.append(msg.get_payload(decode=True).decode(charset, "replace"))
        except Exception:
            parts.append(str(msg.get_payload()))
    text = "\n".join(p for p in parts if p)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:limit]


def body_sha256(raw_bytes):
    return hashlib.sha256(raw_bytes).hexdigest()


def extract_json(text):
    """Return the first JSON object embedded in a model reply."""
    start = text.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except json.JSONDecodeError:
                        break
        start = text.find("{", start + 1)
    raise ValueError("no_json_object")


def scrub(value, secret):
    if not secret:
        return value
    return str(value).replace(secret, "[REDACTED]")


def chat(api_key, model, prompt, max_tokens=2000, base_url=None):
    url = (base_url or os.environ.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/v1").rstrip("/") + "/chat/completions"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你是 LTZZZ 数字实验室的邮件分诊席，只输出要求的 JSON。"},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }
    if re.search(r"deepseek-(?:v\d+(?:-\d+)?-)?(pro|flash)", model):
        body["thinking"] = {"type": "disabled"}
    payload = json.dumps(body).encode()
    req = urllib.request.Request(url, data=payload, headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + api_key,
    })
    with urllib.request.urlopen(req, timeout=240) as resp:
        data = json.loads(resp.read().decode())
    choice = (data.get("choices") or [{}])[0].get("message") or {}
    return choice.get("content") or "", data.get("model"), data.get("usage") or {}


def fetch_headers(conn, uids):
    out = []
    for uid in uids:
        typ, data = conn.fetch(str(uid), "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])")
        if typ != "OK" or not data or not isinstance(data[0], tuple):
            continue
        msg = email.message_from_bytes(data[0][1])
        out.append({
            "uid": str(uid),
            "from": decode_header_value(msg.get("From")),
            "subject": decode_header_value(msg.get("Subject")),
            "date": decode_header_value(msg.get("Date")),
            "message_id": decode_header_value(msg.get("Message-Id")),
        })
    return out


def pop3_headers(conn, ids):
    out = []
    for mid in ids:
        try:
            _resp, lines, _octets = conn.top(mid, 0)
        except Exception:
            continue
        msg = email.message_from_bytes(b"\r\n".join(lines))
        out.append({
            "uid": str(mid),
            "from": decode_header_value(msg.get("From")),
            "subject": decode_header_value(msg.get("Subject")),
            "date": decode_header_value(msg.get("Date")),
            "message_id": decode_header_value(msg.get("Message-Id")),
        })
    return out


def pop3_body(conn, uid):
    try:
        _resp, lines, _octets = conn.retr(str(uid))
    except Exception:
        return "", ""
    raw = b"\r\n".join(lines)
    return message_text(raw), body_sha256(raw)


def fetch_body(conn, uid):
    typ, data = conn.fetch(str(uid), "(BODY.PEEK[])")
    if typ != "OK" or not data or not isinstance(data[0], tuple):
        return "", ""
    raw = data[0][1]
    return message_text(raw), body_sha256(raw)


def build_select_prompt(headers, limit):
    lines = [f"{h['uid']}\t{h['date']}\t{h['from']}\t{h['subject'][:90]}" for h in headers]
    return (
        "下面是邮箱最近邮件的头信息（uid\\t日期\\t发件人\\t主题）。"
        f"请挑选最需要读正文的 {limit} 封，优先含裁决、派单、Task ID、阻塞、回执的项目邮件。"
        '只输出 JSON：{"read_uids":["1","2"]}\n\n' + "\n".join(lines)
    )


def build_triage_prompt(headers, bodies):
    blocks = []
    for h in headers:
        body = bodies.get(h["uid"], "")
        blocks.append(
            f"#uid {h['uid']}\nfrom: {h['from']}\ndate: {h['date']}\nsubject: {h['subject']}\n"
            f"body: {body[:1600] if body else '(未读正文)'}\n"
        )
    return (
        "你是分诊席。逐封归类，只能选一个类别：\n"
        "A_closed 已闭环/仅状态同步；B_deploy 普通工程可直接部署；"
        "C_gpt 需 GPT 五类裁决（资金、退款终态、签名、私钥/助记词、钱包含五签 Safe）；"
        "D_external 外部阻塞；E_owner 需 owner 给值。\n"
        "输出 JSON：{\"items\":[{\"uid\":\"1\",\"category\":\"A_closed\",\"seat\":\"deep\",\"action\":\"不超过30字\",\"needs_gpt\":false}],"
        "\"next_steps\":[\"...\"],\"needs_rulings\":[\"...\"]}\n\n" + "\n".join(blocks)
    )


def build_compose_prompt(headers, triage):
    rows = []
    by_uid = {h["uid"]: h for h in headers}
    for it in triage.get("items", []):
        h = by_uid.get(it.get("uid"), {})
        rows.append(f'{it.get("uid")} | {h.get("subject","")[:70]} | {it.get("category")} | {it.get("seat")} | {it.get("action")}')
    rulings = "\n".join("- " + str(x) for x in triage.get("needs_rulings") or [])
    return (
        "根据下面的邮件分诊结果，写一封给 GPT 决策席的中文邮件。四段：做了什么 / 分流结论 / 下一步 / 需要裁决。\n"
        "要求：不超过 900 字；不写凭据、邮箱密码、邮件正文原文、客户隐私；不写已经完成但实际没做的动作。\n"
        '只输出 JSON：{"subject":"...","body":"..."}\n\n'
        + "分诊行（序号 | 主题 | 类别 | 席位 | 动作）：\n" + "\n".join(rows)
        + "\n\n待裁决：\n" + (rulings or "(无)")
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--read-max", type=int, default=12)
    ap.add_argument("--out", required=True)
    ap.add_argument("--compose-out", default="")
    ap.add_argument("--transport", choices=["imap", "pop3"], default="imap")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()

    address = os.environ.get("MAIL_ADDRESS", "")
    password = os.environ.get("MAIL_PASSWORD", "")
    host = os.environ.get("MAIL_IMAP_HOST", "imap.qq.com")
    folder = os.environ.get("MAIL_IMAP_FOLDER", "INBOX")
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")

    meta = {
        "at": None,
        "mailbox": address,
        "folder": folder,
        "window_days": args.days,
        "model": args.model,
        "mode": "upstream_deep_readonly_imap",
        "id_kind": "imap_sequence",
        "bodies_persisted": False,
        "send_capability": False,
    }
    if not address or not password:
        meta.update(status="blocked_missing_imap_credentials")
        _write(args.out, meta, [])
        return 0
    if not api_key:
        meta.update(status="blocked_missing_api_key")
        _write(args.out, meta, [])
        return 0

    if args.transport == "pop3":
        meta["mode"] = "upstream_deep_readonly_pop3"
        meta["id_kind"] = "pop3_message_number"
        pop_host = os.environ.get("MAIL_POP3_HOST", "pop.126.com")
        pop_port = int(os.environ.get("MAIL_POP3_PORT", "995"))
        try:
            conn = poplib.POP3_SSL(pop_host, pop_port, timeout=30, context=ssl.create_default_context())
            conn.user(address)
            conn.pass_(password)
        except Exception as exc:
            meta.update(status="blocked_pop3_auth", detail=type(exc).__name__)
            _write(args.out, meta, [])
            return 0
        total = len(conn.list()[1])
        meta["messages_total"] = total
        ids = [str(i) for i in range(1, total + 1)][-args.limit:]
        headers = pop3_headers(conn, ids)
        reader = lambda uid: pop3_body(conn, uid)
        close = conn.quit
    else:
        conn = imaplib.IMAP4_SSL(host, 993, ssl_context=ssl.create_default_context(), timeout=30)
        try:
            conn.login(address, password)
        except Exception as exc:
            meta.update(status="blocked_imap_auth", detail=type(exc).__name__)
            _write(args.out, meta, [])
            return 0
        conn.select(folder, readonly=True)

        since = __import__("datetime").datetime.utcnow() - __import__("datetime").timedelta(days=args.days)
        typ, data = conn.search(None, f'(SINCE {since.strftime("%d-%b-%Y")})')
        raw_ids = data[0].split() if typ == "OK" and data and data[0] else []
        uids = [x.decode() if isinstance(x, bytes) else str(x) for x in raw_ids][-args.limit:]
        headers = fetch_headers(conn, uids)
        reader = lambda uid: fetch_body(conn, uid)
        close = conn.logout

    calls = []
    bodies = {}
    hashes = {}
    read_err = ""
    if headers:
        try:
            raw, used_model, usage = chat(api_key, args.model, build_select_prompt(headers, args.read_max), 600)
            calls.append({"stage": "select", "model": used_model, "usage": usage})
            picked = extract_json(raw).get("read_uids") or [h["uid"] for h in headers[:args.read_max]]
        except Exception as exc:
            read_err = "select_stage_" + type(exc).__name__
            picked = [h["uid"] for h in headers[:args.read_max]]
        allowed = {h["uid"]: h for h in headers}
        for uid in [str(u) for u in picked][:args.read_max]:
            if uid not in allowed:
                continue
            body, digest = reader(uid)
            bodies[uid] = body
            hashes[uid] = digest
        try:
            raw, used_model, usage = chat(api_key, args.model, build_triage_prompt(headers, bodies), 3000)
            calls.append({"stage": "triage", "model": used_model, "usage": usage})
            triage = extract_json(raw)
        except Exception as exc:
            triage = {"items": [], "next_steps": [], "needs_rulings": []}
            read_err = (read_err + ";" if read_err else "") + "triage_stage_" + type(exc).__name__
    else:
        triage = {"items": [], "next_steps": [], "needs_rulings": []}

    if args.compose_out and triage.get("items"):
        try:
            raw, used_model, usage = chat(api_key, args.model, build_compose_prompt(headers, triage), 2000)
            calls.append({"stage": "compose", "model": used_model, "usage": usage})
            draft = extract_json(raw)
            with open(args.compose_out, "w", encoding="utf-8") as fh:
                json.dump(draft, fh, ensure_ascii=False, indent=1)
                fh.write("\n")
        except Exception as exc:
            meta["compose_error"] = type(exc).__name__

    try:
        close()
    except Exception:
        pass

    meta.update(
        status="ok" if triage.get("items") else "empty",
        at=__import__("datetime").datetime.utcnow().isoformat() + "Z",
        messages_in_window=len(headers),
        uids_read=sorted(bodies.keys()),
        body_sha256=hashes,
        model_calls=calls,
        total_tokens=sum(int((c.get("usage") or {}).get("total_tokens") or 0) for c in calls),
    )
    if read_err:
        meta["stage_error"] = read_err
    _write(args.out, meta, triage.get("items") or [], headers, hashes, triage)


def _write(out_path, meta, items, headers=None, hashes=None, triage=None):
    payload = {
        "meta": meta,
        "headers": headers or [],
        "items": items,
        "next_steps": (triage or {}).get("next_steps") or [],
        "needs_rulings": (triage or {}).get("needs_rulings") or [],
        "body_sha256": hashes or {},
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(json.dumps({"status": meta.get("status"), "items": len(items), "out": out_path,
                      "tokens": meta.get("total_tokens")}, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())