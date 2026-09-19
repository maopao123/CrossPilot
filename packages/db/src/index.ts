import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export * from './simulator/simulator-store.js';
export * from './simulator/v2-run-store.js';
export * from './commerce/ensure-store-account.js';
export * from './commerce/simulator-adapter.js';
export * from './commerce/outcome-metrics-reader.js';
export * from './commerce/outcome-evaluator.js';
export * from './commerce/amazon-adapter.js';
export * from './commerce/shopify-adapter.js';
export * from './commerce/resolve-adapter.js';
export * from './automation/automation-operation-store.js';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;
