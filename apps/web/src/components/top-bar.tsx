'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '../lib/api-client';
import { useRouter } from 'next/navigation';
import { LogOut, Globe, Box, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { useBusinessContext } from './business-context-provider';

export function TopBar() {
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
    if (mkt === 'AMAZON_US' || !mkt) return 'Amazon 美国站';
    if (mkt === 'AMAZON_UK') return 'Amazon 英国站';
    if (mkt === 'AMAZON_DE') return 'Amazon 德国站';
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
    <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between text-sm sticky top-0 z-40">
      <div className="flex items-center space-x-6 min-w-0">
        <div className="flex items-center space-x-2 bg-surface-elevated px-3 py-1.5 rounded-md border border-border">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <label className="sr-only" htmlFor="workspace-switcher">
            当前工作区
          </label>
          {workspaces.length > 0 ? (
            <select
              id="workspace-switcher"
              aria-label="当前工作区"
              value={workspaceId || ''}
              onChange={(event) => {
                const next = workspaces.find((ws) => ws.id === event.target.value);
                if (next) switchWorkspace(next);
              }}
              className="bg-transparent font-semibold text-white text-sm focus:outline-none cursor-pointer max-w-[180px]"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id} className="bg-surface text-foreground">
                  {ws.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-semibold text-white">
              {workspaceName || (error ? '工作区未加载' : loading ? '正在载入工作区' : '工作区未加载')}
            </span>
          )}
          <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
            {getRoleDisplay(role)}
          </span>
        </div>

        <div className="flex items-center space-x-1.5 text-gray-300">
          <Globe className="w-4 h-4 text-emerald-400" />
          <span className="font-medium">{getMarketplaceDisplay(marketplaceId)}</span>
        </div>

        <div className="hidden lg:flex items-center space-x-2 border-l border-border pl-6 text-gray-300 min-w-0">
          <Box className="w-4 h-4 text-amber-400" />
          <label className="text-gray-400" htmlFor="sku-switcher">
            当前 SKU:
          </label>
          <select
            id="sku-switcher"
            aria-label="当前 SKU"
            value={skuId || ''}
            onChange={(event) => switchSku(event.target.value || null)}
            className="bg-transparent font-medium text-white text-sm focus:outline-none cursor-pointer max-w-[220px]"
          >
            <option value="" className="bg-surface text-foreground">
              未选择 SKU
            </option>
            {skus.map((sku) => (
              <option key={sku.id} value={sku.id} className="bg-surface text-foreground">
                {sku.skuCode}
                {sku.variantName ? ` · ${sku.variantName}` : ''}
              </option>
            ))}
          </select>
          {selectedSku ? (
            <Link
              href={`/app/skus/${selectedSku.id}`}
              className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono hover:text-white"
            >
              {selectedSku.skuCode}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="hidden sm:block text-xs text-gray-400 bg-surface-elevated px-2.5 py-1 rounded border border-border">
          日期: <span className="text-gray-200">{new Date().toISOString().slice(0, 10)}</span>
        </div>

        <ThemeToggle />

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-gray-300">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              {(userName || '未').substring(0, 2).toUpperCase()}
            </div>
            <span className="hidden md:inline font-medium text-white">{userName || '未登录'}</span>
          </div>
          <button
            onClick={handleLogout}
            title="退出登录"
            aria-label="退出登录"
            className="p-1.5 hover:bg-surface-elevated rounded text-gray-400 hover:text-rose-400 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
