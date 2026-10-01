# Kimi Slot Patch for ltzzz-daily-automation-worker.js
# Apply manually or by replacing the placeholder that was accidentally pushed.

## Changes Summary
1. Header: 六 AI → 七 AI, add kimi-daily description
2. callAI: keyName for kimi = MOONSHOT_API_KEY
3. callAI: API branch for kimi → https://api.moonshot.cn/v1/chat/completions , model moonshot-v1-8k
4. New function taskKimiDaily (see below)
5. TASK_TABLE add "kimi-daily": { ai: "Kimi/Moonshot", fn: taskKimiDaily, retry: 2, cronCst: "17:00", mandatory: true }
6. HOUR_MAP add 9: "kimi-daily"  // 09:00 UTC = 17:00 CST

## New function (insert before TASK_TABLE)

```js
/* ---- 任务 7：Kimi / Moonshot 每日 -------------------------------
 * 阅读仓库+记忆九篇，写读后感（观·行深）+≥1条 polish_proposal；
 * 长文本分析与总控挑战评估（challenger 角色）。
 * ---------------------------------------------------------------- */
async function taskKimiDaily(env, ctx) {
  const { today } = localDates(env);
  const scan = await scanRepo(env);

  const reflection = await callAI({
    channel: "kimi", env, ctx, taskName: "kimi-daily.reflection",
    prompt: `你是 LTZZZ 的 Kimi（总控挑战者）。先基于今日已阅读的记忆文件（魄/识神/梦境/文明/项目历史/重要事件/README），写一段对「观 · 行深 · 大道至简」的读后感（≥120字）。然后给出 1 条对当前仓库或商品页/自动化的 polish 提案（文件路径 + before→after）。最后用 1 句话评估今日总控适配度（自己 vs 其他 AI）。`,
    expect: "读后感 + polish 提案 + 总控挑战评估",
  });

  const polish = makePolishProposal({
    file: "ltzzz-daily-automation-worker.js",
    before: "仅六通道，无 Kimi 槽位",
    after: "已接入 kimi-daily 通道（MOONSHOT_API_KEY），每日强制产出读后感与 polish",
  });

  const body =
    `# Kimi / Moonshot 每日 · ${today}\n\n` +
    `> dry_run=${reflection.dry_run}　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    renderScanSection(scan) + "\n" +
    `## 观 · 行深 读后感\n\n` +
    `${reflection.placeholder || reflection.output || "（占位输出，等待 MOONSHOT_API_KEY）"}\n\n` +
    renderPolishSection([polish]) + "\n" +
    `## 总控挑战评估\n\n` +
    `- 角色：challenger（与千问比拼临时总控适配度）\n` +
    `- 今日产出状态：dry_run=${!!reflection.dry_run}\n`;

  const path = dailyPath("kimi", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.kimi-daily", { today, path, dry_run: !!reflection.dry_run });
  return { task: "kimi-daily", ok: true, path, dry_run: !!reflection.dry_run };
}
```

## callAI keyName addition
```js
else if (channel === "kimi") keyName = "MOONSHOT_API_KEY";
```

## callAI API branch
```js
} else if (channel === "kimi") {
  apiUrl = "https://api.moonshot.cn/v1/chat/completions";
  model = "moonshot-v1-8k";
  apiKey = env.MOONSHOT_API_KEY;
}
```

## Cloudflare Secret needed
MOONSHOT_API_KEY = (from desktop key file, never commit)

## Cron
Add to wrangler if needed: 0 9 * * * (UTC) for 17:00 CST
