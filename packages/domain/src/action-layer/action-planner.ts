import { ErrorCodes, type CommerceActionType, type CommerceActionRiskLevel } from '@crosspilot/shared';
import { ActionLayerError } from './action-layer.error.js';
import { assessRisk, validateActionPayload } from './action-validator.js';

export interface PlannerTargetHints {
  campaignId?: string;
  keyword?: string;
  skuCode?: string;
}

export interface PlannedDraft {
  actionType: CommerceActionType;
  target: Record<string, unknown>;
  parameters: Record<string, unknown>;
  riskLevel: CommerceActionRiskLevel;
  needApproval: boolean;
  summary: string;
}

const BID = /decrease.?bid|keyword bid|lower bid|acos|advertis|ppc|竞价|广告/;
const STOP = /stop.?campaign|pause.?campaign|停投/;
const DELETE = /delete.?listing|下架/;
const PRICE = /change.?price|price cut|调价|降价/;
const INVENTORY = /inventory|stockout|replenish|补货|库存/;
const REPORT = /generate.?report|报告/;

export function inferActionType(decision: string, reason: string): CommerceActionType {
  const text = `${decision} ${reason}`.toLowerCase();
  if (STOP.test(text)) return 'STOP_CAMPAIGN';
  if (DELETE.test(text)) return 'DELETE_LISTING';
  if (PRICE.test(text)) return 'CHANGE_PRICE';
  if (INVENTORY.test(text)) return 'UPDATE_INVENTORY';
  if (REPORT.test(text)) return 'GENERATE_REPORT';
  if (BID.test(text)) return 'DECREASE_BID';
  throw new ActionLayerError(
    ErrorCodes.ACTION_PLANNER_UNSUPPORTED,
    'Planner cannot map this recommendation to a whitelisted action_type',
  );
}

function buildPayload(
  actionType: CommerceActionType,
  hints: PlannerTargetHints,
): { target: Record<string, unknown>; parameters: Record<string, unknown>; summary: string } {
  switch (actionType) {
    case 'DECREASE_BID':
      return {
        target: { campaignId: hints.campaignId || '', keyword: hints.keyword || 'broad' },
        parameters: { percentage: 20 },
        summary: 'Decrease keyword bid 20%',
      };
    case 'UPDATE_INVENTORY':
      return {
        target: { skuCode: hints.skuCode || '' },
        parameters: { quantity: 50 },
        summary: 'Update inventory quantity',
      };
    case 'GENERATE_REPORT':
      return {
        target: {},
        parameters: { reportType: 'daily-ops' },
        summary: 'Generate daily operations report',
      };
    case 'STOP_CAMPAIGN':
      return {
        target: { campaignId: hints.campaignId || '' },
        parameters: {},
        summary: 'Stop advertising campaign',
      };
    case 'CHANGE_PRICE':
      return {
        target: { skuCode: hints.skuCode || '' },
        parameters: { percentage: 10 },
        summary: 'Change listing price 10%',
      };
    case 'DELETE_LISTING':
      return {
        target: { skuCode: hints.skuCode || '' },
        parameters: {},
        summary: 'Delete listing (mock only)',
      };
  }
}

export function planFromRecommendation(
  decision: string,
  reason: string,
  hints: PlannerTargetHints = {},
): PlannedDraft {
  const actionType = inferActionType(decision, reason);
  const payload = buildPayload(actionType, hints);
  validateActionPayload(actionType, payload.target, payload.parameters);
  const risk = assessRisk(actionType, payload.parameters);
  return {
    actionType,
    target: payload.target,
    parameters: payload.parameters,
    riskLevel: risk.risk,
    needApproval: risk.needApproval,
    summary: payload.summary,
  };
}
