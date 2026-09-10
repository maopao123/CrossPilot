'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  Box,
  Users,
  Calculator,
  Truck,
  FileEdit,
  Rocket,
  Megaphone,
  ShoppingCart,
  Warehouse,
  MessageSquare,
  TrendingUp,
  BrainCircuit,
  Bot,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/app/overview', label: '01 经营驾驶舱', subLabel: 'Business Overview', icon: LayoutDashboard },
  { href: '/app/market-research', label: '02 市场与选品', subLabel: 'Market & Research', icon: Search },
  { href: '/app/products', label: '03 产品中心', subLabel: 'Product Center', icon: Box },
  { href: '/app/competitors', label: '04 竞品与 VOC', subLabel: 'Competitor & VOC', icon: Users },
  { href: '/app/profit-calculator', label: '05 利润测算', subLabel: 'Profit Calculator', icon: Calculator },
  { href: '/app/suppliers', label: '06 供应链与采购', subLabel: 'Supply & Purchase', icon: Truck },
  { href: '/app/listings', label: '07 Listing 工作台', subLabel: 'Listing Studio', icon: FileEdit },
  { href: '/app/launch', label: '08 新品 Launch', subLabel: 'Launch Center', icon: Rocket },
  { href: '/app/advertising', label: '09 广告运营', subLabel: 'Advertising PPC', icon: Megaphone },
  { href: '/app/orders', label: '10 订单与履约', subLabel: 'Orders', icon: ShoppingCart },
  { href: '/app/inventory', label: '11 库存 / FBA', subLabel: 'Inventory & FBA', icon: Warehouse },
  { href: '/app/reviews', label: '12 评论与退货', subLabel: 'Reviews & Returns', icon: MessageSquare },
  { href: '/app/profit', label: '13 利润中心', subLabel: 'Profit Center', icon: TrendingUp },
  { href: '/app/business-analyst', label: '14 AI 经营分析', subLabel: 'Business Analyst', icon: BrainCircuit },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-surface flex flex-col h-[calc(100vh-3.5rem)] sticky top-14 select-none">
      {/* Brand logo header */}
      <div className="p-4 border-b border-border flex items-center space-x-2">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
          CP
        </div>
        <div>
          <h1 className="font-bold text-white text-base tracking-wide leading-tight">CrossPilot</h1>
          <p className="text-[10px] text-gray-400">AI Cross-border Platform</p>
        </div>
      </div>

      {/* Navigation list */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 text-xs">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-md transition font-medium ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-surface-elevated'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} />
              <div className="flex flex-col truncate">
                <span className="truncate">{item.label}</span>
                <span className="text-[10px] text-gray-500 font-normal leading-none">{item.subLabel}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* AI Copilot Drawer Footer */}
      <div className="p-3 border-t border-border bg-surface-elevated/40">
        <div className="flex items-center space-x-2 text-xs text-gray-300">
          <Bot className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-white">AI Copilot</span>
          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
            Mastra Agent
          </span>
        </div>
      </div>
    </aside>
  );
}
