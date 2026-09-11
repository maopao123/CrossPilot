'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../lib/api-client';
import { WorkspaceSummary } from '@crosspilot/shared';
import { useRouter } from 'next/navigation';
import { LogOut, Globe, Box, ShieldCheck, ChevronDown } from 'lucide-react';

export function TopBar() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [userName, setUserName] = useState<string>('Demo User');

  useEffect(() => {
    async function loadContext() {
      try {
        const ws = await ApiClient.get<WorkspaceSummary>('/api/v1/workspaces/current');
        setWorkspace(ws);
        const me = await ApiClient.get<any>('/api/v1/auth/me');
        if (me?.name) setUserName(me.name);
      } catch (err) {
        console.warn('Could not load current workspace context:', err);
      }
    }
    loadContext();
  }, []);

  const handleLogout = () => {
    ApiClient.clearSession();
    router.push('/login');
  };

  return (
    <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between text-sm sticky top-0 z-40">
      <div className="flex items-center space-x-6">
        {/* Workspace info */}
        <div className="flex items-center space-x-2 bg-surface-elevated px-3 py-1.5 rounded-md border border-border">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="font-semibold text-white">
            {workspace?.name || 'CrossPilot Demo'}
          </span>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
            {workspace?.role || 'OWNER'}
          </span>
        </div>

        {/* Marketplace */}
        <div className="flex items-center space-x-1.5 text-gray-300">
          <Globe className="w-4 h-4 text-emerald-400" />
          <span className="font-medium">
            {workspace?.defaultMarketplace || 'AMAZON_US'}
          </span>
          <span className="text-xs text-gray-400">(USD $)</span>
        </div>

        {/* Active Product & SKU (Marble Toothbrush Holder demo) */}
        <div className="hidden lg:flex items-center space-x-2 border-l border-border pl-6 text-gray-300">
          <Box className="w-4 h-4 text-amber-400" />
          <span className="text-gray-400">Active SKU:</span>
          <span className="font-medium text-white">
            Natural Marble Toothbrush Holder
          </span>
          <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
            MTH-WHITE-001
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Date Context */}
        <div className="hidden sm:block text-xs text-gray-400 bg-surface-elevated px-2.5 py-1 rounded border border-border">
          Date: <span className="text-gray-200">{new Date().toISOString().slice(0, 10)}</span>
        </div>

        {/* User profile & Logout */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-gray-300">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              {userName.substring(0, 2).toUpperCase()}
            </div>
            <span className="hidden md:inline font-medium text-white">{userName}</span>
          </div>

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 hover:bg-surface-elevated rounded text-gray-400 hover:text-rose-400 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
