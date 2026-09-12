'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { WorkspaceSummary } from '@crosspilot/shared';
import { ApiClient } from '../lib/api-client';
import { CatalogSku, loadCatalogSkus } from '../lib/catalog';
import {
  applyMarketplaceSwitch,
  applySkuSwitch,
  applyWorkspaceSwitch,
  readBusinessContext,
} from '../lib/business-context-store.cjs';

export type BusinessContextValue = {
  workspaceId: string | null;
  workspaceName: string | null;
  role: string | null;
  marketplaceId: string | null;
  skuId: string | null;
  workspaces: WorkspaceSummary[];
  skus: CatalogSku[];
  selectedSku: CatalogSku | null;
  loading: boolean;
  error: string | null;
  switchWorkspace: (workspace: WorkspaceSummary) => void;
  switchSku: (skuId: string | null) => void;
  switchMarketplace: (marketplaceId: string | null) => void;
};

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function useBusinessContext(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) {
    throw new Error('useBusinessContext must be used within BusinessContextProvider');
  }
  return ctx;
}

export function BusinessContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [skus, setSkus] = useState<CatalogSku[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(() =>
    typeof window === 'undefined'
      ? { workspaceId: null, role: null, marketplaceId: null, skuId: null }
      : readBusinessContext(window.localStorage),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    setSnapshot(readBusinessContext(window.localStorage));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ApiClient.get<WorkspaceSummary[]>('/api/v1/workspaces');
      const current = await ApiClient.get<WorkspaceSummary>(
        '/api/v1/workspaces/current',
      );
      const catalog = await loadCatalogSkus().catch(() => ({
        skus: [] as CatalogSku[],
      }));
      setWorkspaces(Array.isArray(list) ? list : []);
      setWorkspaceName(current?.name || null);
      const nextSkus = catalog.skus || [];
      setSkus(nextSkus);

      if (current?.id) {
        const token = localStorage.getItem('crosspilot_token');
        if (token) {
          ApiClient.setSession(token, current.id, current.role);
        }
        const stored = readBusinessContext(window.localStorage);
        if (stored.workspaceId !== current.id) {
          applyWorkspaceSwitch(window.localStorage, window.sessionStorage, {
            workspaceId: current.id,
            role: current.role,
            marketplaceId: current.defaultMarketplace,
          });
        } else if (!stored.marketplaceId && current.defaultMarketplace) {
          applyMarketplaceSwitch(
            window.localStorage,
            current.defaultMarketplace,
          );
        }
        if (
          stored.skuId &&
          !nextSkus.some((sku) => sku.id === stored.skuId)
        ) {
          applySkuSwitch(window.localStorage, null);
        }
      }
      refreshFromStorage();
      setError(null);
    } catch (err: any) {
      setError(err?.message || '无法载入业务上下文');
      setWorkspaces([]);
      setSkus([]);
      setWorkspaceName(null);
    } finally {
      setLoading(false);
    }
  }, [refreshFromStorage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const switchWorkspace = useCallback(
    (workspace: WorkspaceSummary) => {
      if (!workspace?.id) return;
      if (workspace.id === snapshot.workspaceId) return;
      applyWorkspaceSwitch(window.localStorage, window.sessionStorage, {
        workspaceId: workspace.id,
        role: workspace.role,
        marketplaceId: workspace.defaultMarketplace,
      });
      const token = localStorage.getItem('crosspilot_token');
      if (token) {
        ApiClient.setSession(token, workspace.id, workspace.role);
      }
      window.location.reload();
    },
    [snapshot.workspaceId],
  );

  const switchSku = useCallback(
    (skuId: string | null) => {
      applySkuSwitch(window.localStorage, skuId);
      refreshFromStorage();
      if (skuId && pathname?.startsWith('/app/skus/')) {
        router.push(`/app/skus/${skuId}`);
      }
    },
    [pathname, refreshFromStorage, router],
  );

  const switchMarketplace = useCallback(
    (marketplaceId: string | null) => {
      applyMarketplaceSwitch(window.localStorage, marketplaceId);
      refreshFromStorage();
    },
    [refreshFromStorage],
  );

  const selectedSku = useMemo(
    () => skus.find((sku) => sku.id === snapshot.skuId) || null,
    [skus, snapshot.skuId],
  );

  const value = useMemo<BusinessContextValue>(
    () => ({
      workspaceId: snapshot.workspaceId,
      workspaceName,
      role: snapshot.role,
      marketplaceId: snapshot.marketplaceId,
      skuId: snapshot.skuId,
      workspaces,
      skus,
      selectedSku,
      loading,
      error,
      switchWorkspace,
      switchSku,
      switchMarketplace,
    }),
    [
      snapshot,
      workspaceName,
      workspaces,
      skus,
      selectedSku,
      loading,
      error,
      switchWorkspace,
      switchSku,
      switchMarketplace,
    ],
  );

  return (
    <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
  );
}
