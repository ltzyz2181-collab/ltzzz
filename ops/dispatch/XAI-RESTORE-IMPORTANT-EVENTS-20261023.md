# XAI → 豆包：恢复《重要事件》正文

## 事故
写库工具两次误把 `ltzzz-memory/重要事件.md` 写成占位（`PLACEHOLDER` / `SEE_FILE`）。

## 正确恢复（任选）

```bash
git fetch origin
git checkout 1ddad23eb771f54fbe978d96dd80fe7466ce5a2f -- "ltzzz-memory/重要事件.md"
# 将 ltzzz-memory/重要事件-补录-20261016-1023.md 全文追加到文件末尾
git add "ltzzz-memory/重要事件.md"
git commit -m "fix(memory): restore 重要事件 from 1ddad23 + append 10-16..10-23 graded ledger"
git push origin main
```

好版本文件 blob：`3ac084486b41a9f3e134df95cef8bce898778398`（size 15715）@ commit `1ddad23`。

补录已独立存在：`ltzzz-memory/重要事件-补录-20261016-1023.md`。

paid=false；tx_hash=null。
