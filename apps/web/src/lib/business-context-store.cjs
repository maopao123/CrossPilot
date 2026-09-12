'use strict';

const BUSINESS_CONTEXT_KEYS = {
  workspaceId: 'crosspilot_workspace_id',
  role: 'crosspilot_role',
  marketplaceId: 'crosspilot_marketplace_id',
  skuId: 'crosspilot_sku_id',
};

const WORKSPACE_SCOPED_SESSION_KEYS = ['crosspilot_active_op_task'];

function applyWorkspaceSwitch(localStore, sessionStore, next) {
  if (!next || !next.workspaceId) {
    throw new Error('workspaceId is required');
  }
  localStore.setItem(BUSINESS_CONTEXT_KEYS.workspaceId, next.workspaceId);
  if (next.role) {
    localStore.setItem(BUSINESS_CONTEXT_KEYS.role, next.role);
  } else {
    localStore.removeItem(BUSINESS_CONTEXT_KEYS.role);
  }
  if (next.marketplaceId) {
    localStore.setItem(BUSINESS_CONTEXT_KEYS.marketplaceId, next.marketplaceId);
  } else {
    localStore.removeItem(BUSINESS_CONTEXT_KEYS.marketplaceId);
  }
  localStore.removeItem(BUSINESS_CONTEXT_KEYS.skuId);
  for (const key of WORKSPACE_SCOPED_SESSION_KEYS) {
    sessionStore.removeItem(key);
  }
}

function applySkuSwitch(localStore, skuId) {
  if (skuId) {
    localStore.setItem(BUSINESS_CONTEXT_KEYS.skuId, skuId);
  } else {
    localStore.removeItem(BUSINESS_CONTEXT_KEYS.skuId);
  }
}

function applyMarketplaceSwitch(localStore, marketplaceId) {
  if (marketplaceId) {
    localStore.setItem(BUSINESS_CONTEXT_KEYS.marketplaceId, marketplaceId);
  } else {
    localStore.removeItem(BUSINESS_CONTEXT_KEYS.marketplaceId);
  }
  localStore.removeItem(BUSINESS_CONTEXT_KEYS.skuId);
}

function readBusinessContext(localStore) {
  return {
    workspaceId: localStore.getItem(BUSINESS_CONTEXT_KEYS.workspaceId),
    role: localStore.getItem(BUSINESS_CONTEXT_KEYS.role),
    marketplaceId: localStore.getItem(BUSINESS_CONTEXT_KEYS.marketplaceId),
    skuId: localStore.getItem(BUSINESS_CONTEXT_KEYS.skuId),
  };
}

module.exports = {
  BUSINESS_CONTEXT_KEYS,
  WORKSPACE_SCOPED_SESSION_KEYS,
  applyWorkspaceSwitch,
  applySkuSwitch,
  applyMarketplaceSwitch,
  readBusinessContext,
};
