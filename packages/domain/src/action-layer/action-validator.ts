import { ErrorCodes, type CommerceActionType, type RiskCheckResult } from '@crosspilot/shared';
import { ActionLayerError } from './action-layer.error.js';
import { isCommerceActionType } from './action-registry.js';

function requireString(target: Record<string, unknown>, key: string): string {
  const value = target[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ActionLayerError(
      ErrorCodes.ACTION_TARGET_REQUIRED,
      `target.${key} is required`,
    );
  }
  return value.trim();
}

function requireNumber(parameters: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = Number(parameters[key]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ActionLayerError(
      ErrorCodes.ACTION_SCHEMA_INVALID,
      `parameters.${key} must be a number between ${min} and ${max}`,
    );
  }
  return value;
}

export function assertKnownActionType(actionType: string): asserts actionType is CommerceActionType {
  if (!isCommerceActionType(actionType)) {
    throw new ActionLayerError(ErrorCodes.ACTION_TYPE_UNKNOWN, `Unknown action_type: ${actionType}`);
  }
}

export function validateActionPayload(
  actionType: CommerceActionType,
  target: Record<string, unknown>,
  parameters: Record<string, unknown>,
): void {
  switch (actionType) {
    case 'DECREASE_BID':
      requireString(target, 'campaignId');
      requireNumber(parameters, 'percentage', 1, 50);
      return;
    case 'UPDATE_INVENTORY':
      requireString(target, 'skuCode');
      requireNumber(parameters, 'quantity', 0, 100000);
      return;
    case 'GENERATE_REPORT':
      requireString(parameters, 'reportType');
      return;
    case 'STOP_CAMPAIGN':
      requireString(target, 'campaignId');
      return;
    case 'CHANGE_PRICE':
      requireString(target, 'skuCode');
      requireNumber(parameters, 'percentage', 1, 80);
      return;
    case 'DELETE_LISTING':
      requireString(target, 'skuCode');
      return;
    case 'CREATE_PURCHASE_ORDER':
      requireString(target, 'supplierId');
      if (!Array.isArray(parameters.lines) || parameters.lines.length === 0) {
        throw new ActionLayerError(
          ErrorCodes.ACTION_SCHEMA_INVALID,
          'parameters.lines must be a non-empty array',
        );
      }
      for (const line of parameters.lines as any[]) {
        if (!line.skuId || typeof line.skuId !== 'string') {
          throw new ActionLayerError(
            ErrorCodes.ACTION_SCHEMA_INVALID,
            'each order line requires string skuId',
          );
        }
        if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
          throw new ActionLayerError(
            ErrorCodes.ACTION_SCHEMA_INVALID,
            'each order line quantity must be a positive number',
          );
        }
        if (!Number.isFinite(line.unitCostMinor) || line.unitCostMinor < 0) {
          throw new ActionLayerError(
            ErrorCodes.ACTION_SCHEMA_INVALID,
            'each order line unitCostMinor must be a non-negative number',
          );
        }
      }
      return;
    default:
      throw new ActionLayerError(ErrorCodes.ACTION_TYPE_UNKNOWN, `Unknown action_type: ${actionType}`);
  }
}

export function assessRisk(
  actionType: CommerceActionType,
  parameters: Record<string, unknown> = {},
): RiskCheckResult {
  if (actionType === 'CREATE_PURCHASE_ORDER') {
    return {
      allowed: true,
      needApproval: true,
      risk: 'high',
      reason: 'CREATE_PURCHASE_ORDER is a high risk procurement action requiring human approval',
    };
  }
  if (actionType === 'DELETE_LISTING' || actionType === 'STOP_CAMPAIGN') {
    return {
      allowed: true,
      needApproval: true,
      risk: 'high',
      reason: `${actionType} is high risk and cannot auto-execute`,
    };
  }
  if (actionType === 'CHANGE_PRICE' && Number(parameters.percentage) > 20) {
    return {
      allowed: true,
      needApproval: true,
      risk: 'high',
      reason: 'CHANGE_PRICE > 20% is high risk and cannot auto-execute',
    };
  }
  if (actionType === 'DECREASE_BID' || actionType === 'UPDATE_INVENTORY' || actionType === 'CHANGE_PRICE') {
    return {
      allowed: true,
      needApproval: true,
      risk: 'medium',
      reason: `${actionType} requires owner approval`,
    };
  }
  return {
    allowed: true,
    needApproval: false,
    risk: 'low',
    reason: `${actionType} may run without an extra approval gate`,
  };
}
