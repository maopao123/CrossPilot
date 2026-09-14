'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '../lib/api-client';
import { useRouter } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { useBusinessContext } from './business-context-provider';
import { Select } from './ui/input';

export function TopBar({ onMenu }: { onMenu?: () => void }) {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const {
    workspaceId,
    workspaceName,
    role,
    marketplaceId,
    skuId,
    workspaces,
    skus,
    selectedSku,
    loading,
    error,
    switchWorkspace,
    switchSku,
  } = useBusinessContext();

  useEffect(() => {
    async function loadUser() {
      try {
        const me = await ApiClient.get<{ name?: string }>('/api/v1/auth/me');
        if (me?.name) setUserName(me.name);
      } catch {
        setUserName('');
      }
    }
    void loadUser();
  }, []);

  const handleLogout = () => {
    ApiClient.clearSession();
    router.push('/login');
  };

  const getMarketplaceDisplay = (mkt?: string | null) => {
    if (mkt === 'AMAZON_US' || !mkt) return '美国站';
    if (mkt === 'AMAZON_UK') return '英国站';
    if (mkt === 'AMAZON_DE') return '德国站';
    return mkt;
  };

  const getRoleDisplay = (value?: string | null) => {
    if (value === 'OWNER') return '所有者';
    if (value === 'ADMIN') return '管理员';
    if (value === 'OPERATOR') return '运营';
    if (value === 'VIEWER') return '只读';
    return value || '未登录';
  };

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-3 text-[13px] md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-elevated lg:hidden"
          onClick={onMenu}
          aria-label="打开导航"
        >
          <Menu className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <label className="sr-only" htmlFor="workspace-switcher">
          当前工作区
        </label>
        {workspaces.length > 0 ? (
          <Select
            id="workspace-switcher"
            aria-label="当前工作区"
            value={workspaceId || ''}
            onChange={(event) => {
              const next = workspaces.find((ws) => ws.id === event.target.value);
              if (next) switchWorkspace(next);
            }}
            className="max-w-[160px] border-0 bg-transparent px-0 py-0 font-medium"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="font-medium">
            {workspaceName || (error ? '工作区未加载' : loading ? '正在载入工作区' : '工作区未加载')}
          </span>
        )}
        <span className="hidden rounded-md bg-surface-elevated px-1.5 py-0.5 text-[11px] text-fg-muted sm:inline">
          {getRoleDisplay(role)}
        </span>
        <span className="hidden text-fg-muted sm:inline">{getMarketplaceDisplay(marketplaceId)}</span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <label className="hidden text-fg-muted md:inline" htmlFor="sku-switcher">
          SKU
        </label>
        <Select
          id="sku-switcher"
          aria-label="当前 SKU"
          value={skuId || ''}
          onChange={(event) => switchSku(event.target.value || null)}
          className="max-w-[200px] py-1"
        >
          <option value="">未选择 SKU</option>
          {skus.map((sku) => (
            <option key={sku.id} value={sku.id}>
              {sku.skuCode}
              {sku.variantName ? ` · ${sku.variantName}` : ''}
            </option>
          ))}
        </Select>
        {selectedSku ? (
          <Link
            href={`/app/skus/${selectedSku.id}`}
            className="hidden font-mono text-[12px] text-accent hover:underline sm:inline"
          >
            {selectedSku.skuCode}
          </Link>
        ) : null}

        <ThemeToggle />

        <span className="hidden max-w-[120px] truncate text-fg md:inline">
          {userName || '未登录'}
        </span>
        <button
          onClick={handleLogout}
          title="退出登录"
          aria-label="退出登录"
          className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-elevated hover:text-rose-600"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
