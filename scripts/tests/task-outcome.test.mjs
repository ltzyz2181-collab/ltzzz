import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTaskOutcome } from "../task-outcome.mjs";

test("successful model execution is not treated as accepted delivery or economic closure", () => {
  assert.deepEqual(classifyTaskOutcome({ status: "success", hasOutput: true }), {
    execution_status: "succeeded",
    delivery_status: "pending_review",
    economic_status: "not_applicable_no_financial_action",
  });
});

test("empty output is not treated as a deliverable", () => {
  assert.equal(classifyTaskOutcome({ status: "success", hasOutput: false }).delivery_status, "missing_output");
});

test("failed execution cannot claim a deliverable", () => {
  assert.deepEqual(classifyTaskOutcome({ status: "api_error", hasOutput: false }), {
    execution_status: "api_error",
    delivery_status: "not_produced",
    economic_status: "not_applicable_no_financial_action",
  });
});

test("owner-disabled seats are not recorded as API failures", () => {
  assert.deepEqual(classifyTaskOutcome({ status: "disabled_by_owner", hasOutput: false }), {
    execution_status: "not_executed_owner_disabled",
    delivery_status: "not_applicable",
    economic_status: "not_applicable_no_financial_action",
  });
});
