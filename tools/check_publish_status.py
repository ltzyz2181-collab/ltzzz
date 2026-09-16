#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LTZZZ 视频发布状态查询脚本（YouTube / TikTok）
==============================================
用途：确认视频是否已发布到两个平台，返回真实 Worker 状态。
注意：本脚本需要能访问 Cloudflare Workers / Google / TikTok 的网络
      （中国大陆直连网络无法访问，请在海外节点 / VPN / Windows 电脑上运行）。

用法：
  python3 tools/check_publish_status.py            # 查询两平台
  python3 tools/check_publish_status.py youtube    # 只查 YouTube
  python3 tools/check_publish_status.py tiktok     # 只查 TikTok
"""
import json
import sys
import urllib.request

WORKERS = {
    "youtube": "https://ltzzz-youtube-post.ltzyz2181.workers.dev/status",
    "tiktok": "https://ltzzz-tiktok-post.ltzyz2181.workers.dev/status",
}


def query(name, url, timeout=20):
    print("=" * 50)
    print(f"[{name.upper()}] {url}")
    try:
        req = urllib.request.Request(
            url, data=b"{}", headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            print(f"HTTP {r.status}")
            try:
                print(json.dumps(json.loads(body), ensure_ascii=False, indent=2))
            except Exception:
                print(body)
            return r.status
    except Exception as e:
        print(f"查询失败：{e}")
        print("→ 可能是网络无法访问 Cloudflare/Google，或 Worker 未部署/域名不对")
        return None


def main():
    targets = sys.argv[1:] or list(WORKERS.keys())
    for t in targets:
        if t in WORKERS:
            query(t, WORKERS[t])
    print("=" * 50)
    print("判定标准：")
    print("  - status.connected = true  → OAuth 已授权")
    print("  - status.last_publish / publish_status = completed → 发布成功")
    print("  - 无记录 / 报错 → 未发布或授权未完成")


if __name__ == "__main__":
    main()
