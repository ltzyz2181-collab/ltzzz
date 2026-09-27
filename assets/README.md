# Asset Center

资产包括：文章、代码、视频、图片、研究、发布记录、可复用提示词。

每个重要资产应有：
- asset_id
- 类型
- 来源任务
- 创建日期
- 当前版本
- 发布状态
- 外部 URL/平台 ID
- 验证状态

## 视频通道

- `assets/video/`：通用视频资产（T026）
- `assets/video/muse/`：Google Muse 生成成片（命名/字段/状态机见该目录 README）
  - 读取/校验：`node scripts/scan-muse-assets.js`（输出 manifest，仅 `reviewed + human_confirm=true` 可发布）

