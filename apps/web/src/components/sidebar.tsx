'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Search,
  Box,
  Users,
  Truck,
  FileEdit,
  Megaphone,
  ShoppingCart,
  Warehouse,
  MessageSquare,
  TrendingUp,
  BrainCircuit,
  Bot,
  BookOpen,
  Wrench,
  Sparkles,
  PlayCircle,
  ClipboardCheck,
} from 'lucide-react';
import { cn } from '../lib/cn';

const NAV_GROUPS: Array<{
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: LucideIcon;
  }>;
}> = [
  {
    title: '今日',
    items: [{ href: '/app/operations/today', label: '今日运营', icon: ClipboardCheck }],
  },
  {
    title: '经营',
    items: [
      { href: '/app/overview', label: '经营概览', icon: LayoutDashboard },
      { href: '/app/profit', label: '利润中心', icon: TrendingUp },
      { href: '/app/business-analyst', label: '经营分析', icon: BrainCircuit },
    ],
  },
  {
    title: '商品与流量',
    items: [
      { href: '/app/market-research', label: '市场调研', icon: Search },
      { href: '/app/products', label: '产品中心', icon: Box },
      { href: '/app/listings', label: 'Listing', icon: FileEdit },
      { href: '/app/advertising', label: '广告', icon: Megaphone },
      { href: '/app/reviews', label: '评论与退货', icon: MessageSquare },
      { href: '/app/competitors', label: '竞品与 VOC', icon: Users },
    ],
  },
  {
    title: '履约',
    items: [
      { href: '/app/orders', label: '订单', icon: ShoppingCart },
      { href: '/app/inventory', label: '库存 / FBA', icon: Warehouse },
      { href: '/app/suppliers', label: '采购', icon: Truck },
    ],
  },
  {
    title: '更多',
    items: [
      { href: '/app/creative', label: '素材中心', icon: Sparkles },
      { href: '/app/tool-center', label: '工具中心', icon: Wrench },
      { href: '/app/operations/automation', label: '运营自动化', icon: PlayCircle },
      { href: '/app/simulator', label: '模拟器沙箱', icon: PlayCircle },
      { href: '/app/architecture', label: '系统架构', icon: BookOpen },
    ],
  },
];

export function Sidebar({
  open = false,
  onNavigate,
}: {
  open?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'z-50 flex h-[100dvh] w-56 shrink-0 flex-col border-r border-border bg-surface lg:sticky lg:top-0',
        'fixed inset-y-0 left-0 transition-transform duration-200 ease-premium lg:relative lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <span className="font-semibold tracking-tight text-fg">CrossPilot</span>
        <span className="text-[11px] text-fg-muted">运营台</span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3 text-[13px]">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium',
                      isActive
                        ? 'bg-accent-subtle text-accent'
                        : 'text-fg-muted hover:bg-surface-elevated hover:text-fg',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div
          aria-disabled="true"
          className="flex cursor-not-allowed select-none items-center gap-2 text-[12px] text-fg-muted opacity-70"
        >
          <Bot className="h-4 w-4" strokeWidth={1.5} />
          <span className="font-medium">AI 助手</span>
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-fg-muted">
            敬请期待
          </span>
        </div>
      </div>
    </aside>
  );
}
