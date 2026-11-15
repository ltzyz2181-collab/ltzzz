#!/usr/bin/env python3
"""把桌面 Codex 的 model_provider 真正切到 DeepSeek（默认 dry-run）。

背景：config.toml 里已写了 [model_providers.deepseek]，但没有顶层
`model_provider = "deepseek"`，也没有把 model 改成 DeepSeek 的模型名，
所以 Codex 默认仍打 api.openai.com（本机 443 不通），模型调用发不出去。

本脚本只做三件事，全部可回滚：
1. 备份 config.toml；
2. 加顶层 model_provider = "deepseek"，并把 model 改成 DeepSeek 模型名；
3. 探测 DeepSeek 是否支持 responses 协议，不支持则把 wire_api 改成 chat。

凭据只在内存里用于探测，不打印、不落盘、不写日志。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PROVIDER_NAME = "deepseek"
DEFAULT_MODEL = "deepseek-chat"


def default_config_path() -> Path:
    return Path(os.path.expanduser("~")) / ".codex" / "config.toml"


def read_text(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as f:
        return f.read()


def write_text(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        f.write(text)


def top_level_boundary(lines: list[str]) -> int:
    """返回第一条 TOML 表头之前的位置；其后都属于表内部，不能插顶层键。"""
    for i, line in enumerate(lines):
        if re.match(r"^\s*\[", line):
            return i
    return len(lines)


def find_key(lines: list[str], key: str, limit: int) -> int | None:
    pat = re.compile(rf'^\s*{re.escape(key)}\s*=')
    for i in range(limit):
        if pat.match(lines[i]):
            return i
    return None


def set_top_level_key(lines: list[str], key: str, value: str) -> tuple[list[str], str]:
    """在顶层设置 key=value，返回新行表与动作说明。"""
    limit = top_level_boundary(lines)
    idx = find_key(lines, key, limit)
    wanted = f'{key} = "{value}"'
    if idx is None:
        anchor = find_key(lines, "model", limit)
        insert_at = (anchor + 1) if anchor is not None else 0
        return lines[:insert_at] + [wanted + "\n"] + lines[insert_at:], f"insert {key}"
    if lines[idx].strip() == wanted.strip():
        return lines, f"unchanged {key}"
    lines[idx] = wanted + "\n"
    return lines, f"replace {key}"


def provider_section(lines: list[str]) -> tuple[int, int] | None:
    start = None
    for i, line in enumerate(lines):
        if re.match(rf"^\s*\[model_providers\.{PROVIDER_NAME}\]", line):
            start = i
        elif start is not None and re.match(r"^\s*\[", line):
            return start, i
    return (start, len(lines)) if start is not None else None


def get_provider_value(lines: list[str], key: str) -> str | None:
    span = provider_section(lines)
    if span is None:
        return None
    start, end = span
    pat = re.compile(rf'^\s*{re.escape(key)}\s*=\s*["\']?([^"\'#\s]+)')
    for i in range(start, end):
        m = pat.match(lines[i])
        if m:
            return m.group(1)
    return None


def set_provider_value(lines: list[str], key: str, value: str) -> tuple[list[str], str]:
    span = provider_section(lines)
    if span is None:
        raise SystemExit("找不到 [model_providers.deepseek] 段，先人工确认配置结构")
    start, end = span
    pat = re.compile(rf'^\s*{re.escape(key)}\s*=')
    wanted = f'{key} = "{value}"'
    for i in range(start + 1, end):
        if pat.match(lines[i]):
            if lines[i].strip() == wanted:
                return lines, f"unchanged wire_api"
            lines[i] = wanted + "\n"
            return lines, f"replace {key}"
    return lines[:end] + [wanted + "\n"] + lines[end:], f"insert {key}"


def probe_responses(base_url: str, token: str, model: str, timeout: int = 20) -> tuple[str, str]:
    """探测 DeepSeek 是否接受 responses 协议。

    返回 (status, note)，status 取值：
      ok          —— 2xx，协议可用
      auth        —— 401/403，端点存在但 key 或余额有问题，不要动 wire_api
      unsupported —— 404/405，端点不存在，应改用 chat 协议
      error       —— 网络或其他错误，未知，不要动 wire_api
    """
    url = base_url.rstrip("/") + "/responses"
    body = json.dumps({"model": model, "input": "ping"}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return "ok", f"HTTP {resp.status}（responses 可用）"
    except urllib.error.HTTPError as e:
        snippet = ""
        try:
            snippet = e.read(120).decode("utf-8", "ignore").replace("\n", " ")
        except Exception:
            pass
        if e.code in (404, 405):
            return "unsupported", f"HTTP {e.code} {snippet}"
        if e.code in (401, 403):
            return "auth", f"HTTP {e.code} 鉴权被拒（端点存在，问题在 key/余额，不据此改协议）"
        return "error", f"HTTP {e.code} {snippet}"
    except Exception as e:  # 网络层面失败也要如实报
        return "error", f"{type(e).__name__}: {e}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="真正写入；不加则只预览")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="DeepSeek 模型名，默认 deepseek-chat")
    ap.add_argument("--config", default=None, help="指定 config.toml 路径（测试用）")
    args = ap.parse_args()

    path = Path(args.config) if args.config else default_config_path()
    if not path.exists():
        print(f"[fail] 找不到 {path}")
        return 2

    text = read_text(path)
    lines = text.splitlines(keepends=True)
    actions: list[str] = []

    lines, a1 = set_top_level_key(lines, "model_provider", PROVIDER_NAME)
    actions.append(a1)
    lines, a2 = set_top_level_key(lines, "model", args.model)
    actions.append(a2)

    base_url = get_provider_value(lines, "base_url") or "https://api.deepseek.com/v1"
    token = get_provider_value(lines, "experimental_bearer_token")
    wire = get_provider_value(lines, "wire_api") or "responses"

    if token:
        status, note = probe_responses(base_url, token, args.model)
        print(f"[probe] {base_url}/responses -> {note}")
        if status == "unsupported" and wire == "responses":
            lines, a3 = set_provider_value(lines, "wire_api", "chat")
            actions.append(a3)
            print("[probe] responses 端点不存在，已把 wire_api 改成 chat（OpenAI chat 兼容协议）")
        elif status == "auth":
            print("[probe] 端点存在但鉴权失败：先核对 key 与余额，配置不动")
        elif status == "error":
            print("[probe] 探测失败但不是协议结论，配置不动")
    else:
        print("[probe] 配置里没有 experimental_bearer_token，跳过协议探测")

    for a in actions:
        print(f"[action] {a}")

    if not args.apply:
        print("[dry-run] 未写入。确认无误后加 --apply 执行。")
        print("[preview] 变更后的顶层与 provider 段：")
        limit = top_level_boundary(lines)
        for line in lines[:limit]:
            print("   " + line.rstrip("\n"))
        span = provider_section(lines)
        if span:
            for line in lines[span[0]:span[1]]:
                stripped = line.rstrip("\n")
                if re.match(r"^\s*(experimental_bearer_token|api_key|token)\s*=", stripped):
                    stripped = re.sub(r'(=\s*")[^"]*(")', r"\1***\2", stripped)
                print("   " + stripped)
        return 0

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(path.name + f".bak-{stamp}")
    shutil.copy2(path, backup)
    write_text(path, "".join(lines))
    print(f"[ok] 已备份到 {backup.name}")
    print(f"[ok] 已写入 {path}")
    print(f"[rollback] Copy-Item -LiteralPath '{backup}' -Destination '{path}' -Force")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:  # 被 head/less 截断时不要抛栈
        sys.exit(0)
