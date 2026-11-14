// 开放标签预览页的参数校验（fail-closed）：任何一项不满足即报错退出，不静默放过。
// 运行：node scripts/tests/open-tag-preview.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(ROOT, "open", "index.html"), "utf8");
const appJson = JSON.parse(readFileSync(join(ROOT, "miniprogram", "app.json"), "utf8"));
const projectCfg = JSON.parse(readFileSync(join(ROOT, "miniprogram", "project.config.json"), "utf8"));

const cfgBlock = html.match(/var CFG = \{[\s\S]*?\};/);
const cfg = cfgBlock
  ? Object.fromEntries(
      [...cfgBlock[0].matchAll(/(\w+)\s*:\s*"([^"]*)"/g)].map((m) => [m[1], m[2]])
    )
  : {};

test("开放标签页面存在且使用 username 属性（不是 appid）", () => {
  assert.match(html, /wx-open-launch-weapp/, "缺少 wx-open-launch-weapp 标签定义");
  assert.match(html, /setAttribute\("username"/, "标签必须用 username 属性");
  assert.doesNotMatch(html, /setAttribute\("appid"/, "wx-open-launch-weapp 不接受 appid 属性");
});

test("AppID 与小程序工程配置一致", () => {
  assert.equal(cfg.appid, projectCfg.appid, `预览页 AppID(${cfg.appid}) 与 project.config.json(${projectCfg.appid}) 不一致`);
  assert.match(cfg.appid, /^wx[0-9a-f]{16}$/, "AppID 格式非法");
});

test("跳转路径在小程序 app.json 页面清单内", () => {
  const page = cfg.path.replace(/\.html$/, "").split("?")[0];
  assert.ok(page, "未配置跳转路径");
  assert.ok(
    appJson.pages.includes(page),
    `路径 ${page} 不在已注册页面中：${appJson.pages.join(", ")}`
  );
});

test("未配置原始 ID 时必须 fail-closed，不得渲染标签", () => {
  const hasGuard = /if \(!usernameOk\)[\s\S]*?return;/.test(html);
  assert.ok(hasGuard, "缺少 username 未配置时的提前返回守卫，可能误渲染成“看起来成功”");
  const ok = /^gh_[0-9a-z]{8,}$/.test((cfg.username || "").trim());
  if (!ok) {
    assert.match(html, /fail-closed/, "诊断态提示缺失");
  }
});

test("原始 ID 存在时格式必须合法", () => {
  const raw = (cfg.username || "").trim();
  if (raw) assert.match(raw, /^gh_[0-9a-z]{8,}$/, `原始 ID 格式非法：${raw}`);
});

test("页面包含可回退说明与标签事件回执", () => {
  assert.match(html, /删除本文件即可完全回退/, "缺少回退说明");
  assert.match(html, /addEventListener\("launch"/, "缺少 launch 事件回执");
  assert.match(html, /addEventListener\("error"/, "缺少 error 事件回执");
});

test("标签状态必须由升级检测决定，不得在插入 DOM 后无条件报“已渲染”", () => {
  assert.match(html, /customElements\.get\("wx-open-launch-weapp"\)/, "缺少自定义元素升级检测");
  assert.match(html, /shadowRoot/, "缺少影子树内容检测");
  assert.match(html, /未升级/, "缺少“未升级”状态文案");
  assert.match(html, /已插入宿主/, "插入后应先报中间态，不能直接写“已渲染”");
});
