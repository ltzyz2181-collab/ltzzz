#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LTZZZ 一键发布脚本（YouTube Private + TikTok 私密）
====================================================
在「可访问 Google / TikTok / Cloudflare」的网络设备上运行（Windows 电脑 / 海外节点 / 手机开代理）。
流程：检查状态 → 未授权则给授权链接（浏览器打开登录） → 授权后上传 → 输出结果。

用法：
  python3 tools/publish_now.py                          # 两平台
  python3 tools/publish_now.py youtube                  # 只 YouTube
  python3 tools/publish_now.py tiktok                   # 只 TikTok
  python3 tools/publish_now.py --video <公开URL>        # 指定视频 URL（必填，Worker 需能访问）
"""
import json
import sys
import time
import urllib.request
import urllib.parse

BASE = {
    "youtube": "https://ltzzz-youtube-post.ltzyz2181.workers.dev",
    "tiktok": "https://ltzzz-tiktok-post.ltzyz2181.workers.dev",
}
VIDEO_URL = "https://ltzzz.com/tools/output/20260916-200750/ltzzz-20260916-200750.mp4"  # push 后生效


def call(base, path, body, timeout=60):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8", "replace"))


def run(name, video_url):
    base = BASE[name]
    print("=" * 56)
    print(f"[{name.upper()}] {base}")
    try:
        st, status = call(base, "/status", {})
        print("状态:", json.dumps(status, ensure_ascii=False))
    except Exception as e:
        print(f"无法访问 Worker：{e}")
        print("→ 请确认网络可访问 workers.dev，且 Worker 已部署")
        return

    if not status.get("connected"):
        print(f"→ {name} 未授权。正在生成授权链接...")
        try:
            _, auth = call(base, "/auth/start", {})
            url = auth.get("auth_url")
            if url:
                print("请复制并在浏览器打开授权（登录账号后允许）：")
                print(url)
                input(f"授权完成后按回车继续（{name}）...")
            else:
                print("auth_url 缺失，返回:", auth)
                return
        except Exception as e:
            print(f"授权失败：{e}")
            return
        st, status = call(base, "/status", {})
        print("授权后状态:", json.dumps(status, ensure_ascii=False))
        if not status.get("connected"):
            print("→ 授权仍未生效，停止。")
            return

    # 上传
    if name == "youtube":
        path, body = "/upload", {"video_url": video_url, "title": "LTZZZ 数字实验室 · 观行深实验（测试）", "privacy": "private"}
    else:
        path, body = "/publish", {"video_url": video_url, "title": "LTZZZ 数字实验室 · 观行深实验（测试）", "privacy": 1}
    print(f"→ 正在上传 {name} ...")
    try:
        st, res = call(base, path, body, timeout=180)
        print("结果:", json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(f"上传失败：{e}")


def main():
    args = sys.argv[1:]
    video_url = VIDEO_URL
    if "--video" in args:
        i = args.index("--video")
        video_url = args[i + 1]
    targets = [a for a in args if a in ("youtube", "tiktok")] or ["youtube", "tiktok"]
    print(f"视频 URL：{video_url}\n（需为公网可访问地址；push 到 GitHub 后 ltzzz.com 路径生效）")
    for t in targets:
        run(t, video_url)
    print("=" * 56)
    print("完成后请到 YouTube Studio / TikTok 创作者中心确认（默认 private/私密，不会公开）。")


if __name__ == "__main__":
    main()
