#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LTZZZ 账本同步脚本
用途：从 ltzzz-pay Worker 拉取账本（Markdown），写入仓库 finance/LTZZZ-AI财务实验日志.md，
      使「钱 → 实验 → 数据 → 决策」沉淀为 LTZZZ 内容资产。

用法：
  set PAY_WORKER_URL=https://ltzzz-pay-proxy.ltzyz2181.workers.dev
  set PAY_AUTH_TOKEN=你的内部调用凭证
  python tools/sync_pay_ledger.py
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

WORKER_URL = os.environ.get("PAY_WORKER_URL", "https://ltzzz-pay-proxy.ltzyz2181.workers.dev")
TOKEN = os.environ.get("PAY_AUTH_TOKEN", "")
OUT = Path(__file__).resolve().parent.parent / "finance" / "LTZZZ-AI财务实验日志.md"


def fetch(path: str) -> str:
    req = urllib.request.Request(WORKER_URL + path, headers={
        "Authorization": "Bearer " + TOKEN,
        "User-Agent": "ltzzz-sync-ledger",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def main() -> int:
    if not TOKEN:
        print("[错误] 未设置 PAY_AUTH_TOKEN（环境变量）", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        md = fetch("/ledger?format=md")
    except Exception as e:  # noqa: BLE001
        print(f"[错误] 拉取账本失败: {e}", file=sys.stderr)
        return 2
    OUT.write_text(md, encoding="utf-8")
    print(f"[完成] 已写入 {OUT}")
    print(md.splitlines()[2] if len(md.splitlines()) > 2 else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
