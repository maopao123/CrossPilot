/**
 * CrossPilot Domain Package
 *
 * Encapsulates pure business rules, formulas, and state machines.
 * Decoupled from UI, NestJS controllers, and database drivers.
 */

export * from './purchase/purchase-order.state-machine.js';
export * from './inventory/inventory-movement.service.js';
export * from './inventory/inventory-planning.service.js';
export * from './profit/profit-calculation.service.js';

export const DOMAIN_CONSTANTS = {
  DEFAULT_CURRENCY: 'USD',
  DEFAULT_MARKETPLACE: 'AMAZON_US',
  DEFAULT_TIMEZONE: 'America/Los_Angeles',
  DEFAULT_REFERRAL_FEE_RATE: 0.15,
  DEFAULT_FBA_FEE_ESTIMATE: 4.5,
  DEFAULT_LEAD_TIME_DAYS: 15,
  DEFAULT_SAFETY_STOCK_DAYS: 14,
} as const;
