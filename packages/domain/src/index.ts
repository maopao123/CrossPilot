/**
 * CrossPilot Domain Package
 *
 * Encapsulates pure business rules, formulas, state machines,
 * and deterministic scenario engines.
 * Decoupled from UI, NestJS controllers, and database drivers.
 */

export * from './purchase/purchase-order.state-machine.js';
export * from './inventory/inventory-movement.service.js';
export * from './inventory/inventory-planning.service.js';
export * from './profit/profit-calculation.service.js';
export * from './scenario/scenario-generator.js';
export * from './variance/variance-attribution.service.js';
export * from './compliance/compliance-judge.service.js';
export * from './advertising/ad-optimizer.service.js';
export * from './listing/listing.types.js';
export * from './listing/listing-claim.types.js';
export * from './listing/unit-conversion.service.js';
export * from './listing/claim-grounding.service.js';
export * from './listing/claim-repair.service.js';
export * from './listing/surface-claim-extractor.service.js';
export * from './listing/marketplace-policy.profile.js';
export * from './listing/listing-workflow-dag.service.js';
export * from './knowledge/index.js';
export * from './research/index.js';
export * from './operations/index.js';
export * from './playbook/index.js';
export * from './intelligence/index.js';
export * from './simulator/index.js';

export const DOMAIN_CONSTANTS = {
  DEFAULT_CURRENCY: 'USD',
  DEFAULT_MARKETPLACE: 'AMAZON_US',
  DEFAULT_TIMEZONE: 'America/Los_Angeles',
  DEFAULT_REFERRAL_FEE_RATE: 0.15,
  DEFAULT_FBA_FEE_ESTIMATE: 4.5,
  DEFAULT_LEAD_TIME_DAYS: 15,
  DEFAULT_SAFETY_STOCK_DAYS: 14,
} as const;
