import test from "node:test";
import assert from "node:assert/strict";
import {ALLOWED_ISSUES, parseIssueList, pickDoneState, triageIssues} from "../linear-board-triage.mjs";

const issuePayload = (identifier = "LTZ-1") => ({
  data: {
    issue: {
      id: "uuid-" + identifier,
      identifier,
      title: "Get familiar with Linear",
      team: {key: "LTZ", states: {nodes: [
        {id: "s-todo", name: "Todo", type: "unstarted", position: 1},
        {id: "s-done", name: "Done", type: "completed", position: 3},
      ]}},
      state: {id: "s-todo", name: "Todo", type: "unstarted"},
    },
  },
});

const writePayload = {data: {issueUpdate: {success: true, issue: {identifier: "LTZ-1", state: {name: "Done", type: "completed"}}}}};

function mockFetcher({onMutation} = {}) {
  return async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.query.includes("issueUpdate")) {
      if (onMutation) onMutation(body);
      return Response.json(writePayload);
    }
    return Response.json(issuePayload());
  };
}

test("只允许 Linear 入门模板这 4 条，其他标识符一律拒绝", () => {
  assert.deepEqual(ALLOWED_ISSUES, ["LTZ-1", "LTZ-2", "LTZ-3", "LTZ-4", "LTZ-9"]);
  assert.deepEqual(parseIssueList("LTZ-1, LTZ-2"), ["LTZ-1", "LTZ-2"]);
  assert.throws(() => parseIssueList("LTZ-5"), /not_allowlisted:LTZ-5/);
  assert.deepEqual(parseIssueList("LTZ-9"), ["LTZ-9"]);
  assert.throws(() => parseIssueList(""), /issues_required/);
});

test("Done 状态按 type=completed 选，缺了就报错而不是乱选", () => {
  assert.equal(pickDoneState([{id: "s", name: "Done", type: "completed"}]).id, "s");
  assert.throws(() => pickDoneState([{id: "s", name: "Todo", type: "unstarted"}]), /no_completed_state/);
});

test("未确认时只做 dry-run，一个 mutation 都不发", async () => {
  let mutations = 0;
  const report = await triageIssues({key: "lin_api_fixture", issues: ["LTZ-1"], confirm: false, fetcher: mockFetcher({onMutation: () => mutations++})});
  assert.equal(mutations, 0);
  assert.equal(report.ok, true);
  assert.equal(report.confirmed, false);
  assert.equal(report.results[0].step, "dry_run");
  assert.equal(report.results[0].planned.state_name, "Done");
});

test("确认后只对允许清单发 issueUpdate，并把前后状态写进结果", async () => {
  const sent = [];
  const report = await triageIssues({key: "lin_api_fixture", issues: ["LTZ-1", "LTZ-2"], confirm: true, fetcher: mockFetcher({onMutation: (b) => sent.push(b)})});
  assert.equal(sent.length, 2);
  assert.ok(sent.every((b) => b.query.includes("issueUpdate") && b.variables.stateId === "s-done"));
  assert.equal(report.ok, true);
  assert.equal(report.results[0].before, "Todo");
  assert.equal(report.results[0].after, "Done");
});

test("读取失败不会被当成成功，也不会继续写", async () => {
  const fetcher = async () => Response.json({errors: [{message: "Entity not found"}]});
  const report = await triageIssues({key: "lin_api_fixture", issues: ["LTZ-1"], confirm: true, fetcher});
  assert.equal(report.ok, false);
  assert.equal(report.results[0].step, "read");
});
