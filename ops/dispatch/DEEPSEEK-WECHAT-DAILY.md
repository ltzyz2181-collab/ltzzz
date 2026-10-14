# 公众号每日文章任务

主责DeepSeek，走现有DEEPSEEK_API_KEY及已验证模型，不占Manus聊天额度。现有.github/workflows/daily-article-publish.yml每日11:20UTC生成文章，Worker12:00UTC尝试建草稿；生成文章不等于草稿成功，草稿成功不等于发表。
输入真实当日记录，正文区分事实/观点/提案，不写凭据和私人细节，保留来源路径。模型正文必须完整，未完成则记失败，不伪装为正式文章。
稿件：content/daily-articles/YYYY-MM-DD.md。既有登录浏览器执行席负责核对服务号账号、放入草稿箱和补封面，记录真实草稿ID及截图；owner最终检查发表。官方接口IP白名单等阻塞时走已登录浏览器，不让owner重复发送AppSecret。
Manus仅负责Instagram；抖音和视频号暂停，包括对应文案制作和发布。未接单或草稿未核验明确标assigned/blocked，不报已发表。
