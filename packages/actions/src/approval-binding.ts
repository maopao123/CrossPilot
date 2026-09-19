import { createHash } from 'node:crypto';
import { ActionProposal, ActionDispatcherContext } from './action.types.js';

export interface CanonicalPayloadFields {
  skuCode?: string;
  title?: string;
  price?: number;
  workflow?: string;
}

/**
 * Computes a deterministic SHA-256 canonical hash of the critical execution parameters:
 * skuCode, title, price, and workflow.
 */
export function computeCanonicalPayloadHash(
  payload: Record<string, unknown> | string | null | undefined,
): string {
  if (!payload) return '';
  let parsed: Record<string, unknown>;
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch {
      return createHash('sha256').update(payload).digest('hex');
    }
  } else {
    parsed = payload;
  }

  const canonical: Record<string, unknown> = {};

  const rawSku = parsed.skuCode || parsed.sku || parsed.targetId;
  if (rawSku !== undefined && rawSku !== null) {
    canonical.skuCode = String(rawSku).trim();
  }

  if (parsed.title !== undefined && parsed.title !== null) {
    canonical.title = String(parsed.title).trim();
  }

  if (parsed.price !== undefined && parsed.price !== null) {
    const numPrice = Number(parsed.price);
    canonical.price = Number.isNaN(numPrice) ? parsed.price : Math.round(numPrice * 100) / 100;
  }

  const rawWorkflow = parsed.workflow;
  if (rawWorkflow !== undefined && rawWorkflow !== null) {
    canonical.workflow = String(rawWorkflow).trim().toUpperCase().replace(/[\s-]+/g, '_');
  }

  // Sort keys deterministically
  const sortedKeys = Object.keys(canonical).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = canonical[k];
  }

  return createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex');
}

/**
 * Verifies that the executed proposal payload strictly adheres to the approved payload snapshot and/or hash.
 * Blocks any tampering with skuCode, title, price, or workflow.
 */
export function verifyApprovedPayloadBinding(
  proposal: ActionProposal,
  context: ActionDispatcherContext,
): { valid: boolean; reason?: string } {
  const rawApprovedPayload =
    context.approvedPayload ||
    proposal.approvedPayload ||
    (context.approvalProof as any)?.approvedPayload ||
    (proposal.approvalProof as any)?.approvedPayload ||
    (proposal.payload as any)?._approval?.payload;

  const expectedHash =
    context.approvedPayloadHash ||
    proposal.approvedPayloadHash ||
    (context.approvalProof as any)?.payloadHash ||
    (proposal.approvalProof as any)?.payloadHash ||
    (proposal.payload as any)?._approval?.payloadHash;

  const executedPayload = (proposal.payload || {}) as Record<string, unknown>;

  // 1. Snapshot field-by-field verification
  if (rawApprovedPayload) {
    let approved: Record<string, unknown>;
    if (typeof rawApprovedPayload === 'string') {
      try {
        approved = JSON.parse(rawApprovedPayload);
      } catch {
        approved = {};
      }
    } else {
      approved = rawApprovedPayload;
    }

    // A. Check SKU
    const approvedSku = String(approved.skuCode || approved.sku || approved.targetId || '').trim();
    const executedSku = String(
      executedPayload.skuCode || executedPayload.sku || (executedPayload.targetId && typeof executedPayload.targetId === 'string' ? executedPayload.targetId : '') || '',
    ).trim();
    if (approvedSku) {
      if (!executedSku) {
        return {
          valid: false,
          reason: `Field 'skuCode' is missing in execution payload (approved: "${approvedSku}")`,
        };
      }
      if (approvedSku !== executedSku) {
        return {
          valid: false,
          reason: `Field 'skuCode' mismatch: approved "${approvedSku}" does not match execution "${executedSku}"`,
        };
      }
    }

    // B. Check Price
    if (approved.price !== undefined && approved.price !== null) {
      const approvedPrice = Math.round(Number(approved.price) * 100) / 100;
      if (executedPayload.price === undefined || executedPayload.price === null || executedPayload.price === '') {
        return {
          valid: false,
          reason: `Field 'price' is missing in execution payload (approved: ${approvedPrice})`,
        };
      }
      const executedPrice = Math.round(Number(executedPayload.price) * 100) / 100;
      if (approvedPrice !== executedPrice) {
        return {
          valid: false,
          reason: `Field 'price' mismatch: approved ${approvedPrice} does not match execution ${executedPrice}`,
        };
      }
    }

    // C. Check Title
    if (approved.title !== undefined && approved.title !== null && String(approved.title).trim() !== '') {
      const approvedTitle = String(approved.title).trim();
      if (executedPayload.title === undefined || executedPayload.title === null || String(executedPayload.title).trim() === '') {
        return {
          valid: false,
          reason: `Field 'title' is missing in execution payload (approved: "${approvedTitle}")`,
        };
      }
      const executedTitle = String(executedPayload.title).trim();
      if (approvedTitle !== executedTitle) {
        return {
          valid: false,
          reason: `Field 'title' mismatch: approved "${approvedTitle}" does not match execution "${executedTitle}"`,
        };
      }
    }

    // D. Check Workflow
    if (approved.workflow !== undefined && approved.workflow !== null && String(approved.workflow).trim() !== '') {
      const approvedWf = String(approved.workflow).trim().toUpperCase().replace(/[\s-]+/g, '_');
      if (executedPayload.workflow === undefined || executedPayload.workflow === null || String(executedPayload.workflow).trim() === '') {
        return {
          valid: false,
          reason: `Field 'workflow' is missing in execution payload (approved: "${approvedWf}")`,
        };
      }
      const executedWf = String(executedPayload.workflow).trim().toUpperCase().replace(/[\s-]+/g, '_');
      if (approvedWf !== executedWf) {
        return {
          valid: false,
          reason: `Field 'workflow' mismatch: approved "${approvedWf}" does not match execution "${executedWf}"`,
        };
      }
    }
  }

  // 2. Canonical Hash verification
  if (expectedHash) {
    const actualHash = computeCanonicalPayloadHash(executedPayload);
    if (actualHash !== expectedHash) {
      return {
        valid: false,
        reason: `Canonical payload hash mismatch: expected "${expectedHash}", got "${actualHash}"`,
      };
    }
  }

  return { valid: true };
}
