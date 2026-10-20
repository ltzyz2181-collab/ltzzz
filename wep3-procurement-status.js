export const PAID_DRAFT_STATUS='paid_delivery_accepted_engineering_draft';
export const ENGINEERING_DRAFT_SCOPE='复述提示词＋回归件，非原创设计、非生产部署';
export function acceptedEngineeringDraft(status){return ['paid_delivery_accepted',PAID_DRAFT_STATUS].includes(status);}
export function procurementPresentation(order){
 if(!order)return order;
 if(order.delivery_accepted===true&&acceptedEngineeringDraft(order.status))return {...order,runtime_status:order.runtime_status||order.status,status:PAID_DRAFT_STATUS,acceptance_scope:order.novelty_required?'接口问题候选＋回归草稿；新增价值待独立复现，非原创设计、非生产部署':ENGINEERING_DRAFT_SCOPE,original_design_verified:false,production_deployment_verified:false,...(order.novelty_required?{value_acceptance:'pending_independent_reproduction'}:{})};
 return order;
}
