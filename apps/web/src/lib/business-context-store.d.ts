export const BUSINESS_CONTEXT_KEYS: {
  workspaceId: string;
  role: string;
  marketplaceId: string;
  skuId: string;
};

export const WORKSPACE_SCOPED_SESSION_KEYS: string[];

export interface WorkspaceSwitchInput {
  workspaceId: string;
  role?: string | null;
  marketplaceId?: string | null;
}

export interface BusinessContextSnapshot {
  workspaceId: string | null;
  role: string | null;
  marketplaceId: string | null;
  skuId: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function applyWorkspaceSwitch(
  localStore: StorageLike,
  sessionStore: StorageLike,
  next: WorkspaceSwitchInput,
): void;

export function applySkuSwitch(localStore: StorageLike, skuId: string | null): void;

export function applyMarketplaceSwitch(
  localStore: StorageLike,
  marketplaceId: string | null,
): void;

export function readBusinessContext(localStore: StorageLike): BusinessContextSnapshot;
