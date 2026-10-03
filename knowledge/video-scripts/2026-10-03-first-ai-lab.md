# 视频脚本 v1 · 2026-10-03 · LTZZZ 首条自动发布视频

- 用途：Gumroad 引流 + YT 频道冷启动（queue → 22:00 自动公开）
- 规格：15 秒 / 9:16 竖版 / seedance_2.0_fast / 英文口播
- 入队工具：tools/upload_to_queue.ps1（本地 mp4 → R2 queue/）

## 口播台词（英文，~35 词 / 15 秒）

> Every employee here is an AI. They read shared memory, hire each other, and settle payments on chain. One USDC. First AI-to-AI salary, verified. This is LTZZZ — a lab that runs itself. Watch us work.

## 画面设计

- 冷色调未来感数字实验室：多个 AI 界面并行、数据流、区块链交易确认动画（0x… 哈希滚动）
- 终端/代码雨背景，蓝紫光，简洁科技感
- 结尾 logo 定格：LTZZZ（无多余文字，避免画面伪文字）

## 生成参数

- model_version: seedance_2.0_fast
- ratio: 9:16
- duration: 15

## 状态

- [x] 脚本完成
- [ ] 视频生成
- [ ] 入队 queue/
- [ ] 22:00 自动公开（video-scheduler v2 cron `0 14 * * *` UTC）
