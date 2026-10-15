export function classifyTaskOutcome({ status, hasOutput = false }) {
  if(status==='external_discussion_only'||status==='external_daily_return')return {execution_status:'not_scheduled_external_seat',delivery_status:hasOutput?'not_submitted':'not_produced',economic_status:'not_applicable_no_financial_action'};
  if(status==='incomplete_output')return {execution_status:'response_received_incomplete',delivery_status:'rejected_incomplete',economic_status:'not_applicable_no_financial_action'};
  if (status === "disabled_by_owner") {
    return {
      execution_status: "not_executed_owner_disabled",
      delivery_status: "not_applicable",
      economic_status: "not_applicable_no_financial_action",
    };
  }

  if (status === "success") {
    return {
      execution_status: "succeeded",
      delivery_status: hasOutput ? "pending_review" : "missing_output",
      economic_status: "not_applicable_no_financial_action",
    };
  }

  return {
    execution_status: status || "unknown",
    delivery_status: "not_produced",
    economic_status: "not_applicable_no_financial_action",
  };
}
