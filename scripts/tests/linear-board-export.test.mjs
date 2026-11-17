import test from "node:test";
import assert from "node:assert/strict";
import {buildBoardExport, priorityName, SCHEMA} from "../linear-board-export.mjs";

const board = () => ({
  ok: true,
  viewer: {name: "李天柱"},
  organization: {name: "LTZZZ", url_key: "ltzzz"},
  issue_count: 2,
  response_sha256: "a".repeat(64),
  read_at_utc: "2026-11-17T09:24:40.726Z",
  issues: [
    {identifier: "LTZ-5", title: "微信小程序沙箱路由与真实回调验收", priority: 1, state: "In Progress", state_type: "started", updated_at: "2026-11-10T09:00:00.000Z", url: "https://linear.app/ltzzz/issue/LTZ-5", comments: [{id: "c-1", created_at: "2026-11-10T09:01:00.000Z", excerpt: "short"}]},
    {identifier: "LTZ-6", title: "GOAL-LTZZZ-AUTONOMY", priority: 2, state: "Done", state_type: "completed", updated_at: "2026-11-09T09:00:00.000Z", url: "https://linear.app/ltzzz/issue/LTZ-6", comments: []},
  ],
});

test("一次成功读取被映射成可提交的看板快照，含标题与状态", () => {
  const snap = buildBoardExport(board(), {clock: () => Date.parse("2026-11-17T10:00:00Z")});
  assert.equal(snap.schema, SCHEMA);
  assert.equal(snap.workspace.url, "https://linear.app/ltzzz");
  assert.equal(snap.issue_count, 2);
  assert.equal(snap.writes_performed, false);
  assert.equal(snap.read_finished_at_utc, "2026-11-17T10:00:00.000Z");
  assert.deepEqual(snap.issues[0].priority, {value: 1, name: "Urgent"});
  assert.equal(snap.issues[0].id, "LTZ-5");
  assert.equal(snap.issues[0].title, "微信小程序沙箱路由与真实回调验收");
  assert.equal(snap.issues[0].status, "In Progress");
  assert.equal(snap.issues[1].priority.name, "High");
  assert.equal(snap.public_redaction.full_comment_bodies, false);
});

test("失败的读取绝不产出空看板", () => {
  assert.throws(() => buildBoardExport(null), /board_read_not_ok/);
  assert.throws(() => buildBoardExport({ok: false, http: 401}), /board_read_not_ok/);
  assert.throws(() => buildBoardExport({ok: true, issues: null}), /board_read_not_ok/);
});

test("优先级映射覆盖 0-4，越界给 null 而不是猜", () => {
  assert.equal(priorityName(0), "No priority");
  assert.equal(priorityName(4), "Low");
  assert.equal(priorityName(9), null);
  assert.equal(priorityName(null), null);
  assert.equal(priorityName("2"), null);
});