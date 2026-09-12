'use client';

import React, { useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import {
  Sparkles,
  Camera,
  Layers,
  Image as ImageIcon,
  Video,
  Scissors,
  CheckCircle2,
  DollarSign,
  Download,
  RotateCcw,
  Sliders,
  ExternalLink,
  Info,
  ShieldCheck,
} from 'lucide-react';

interface CreativePackState {
  mainImage: any;
  lifestyleImage: any;
  infographic: any;
  resizedVariants: any[];
  videoShowcase: any;
  totalCostUsd: number;
  totalDurationMs: number;
}

export default function CreativeStudioPage() {
  const [selectedSku, setSelectedSku] = useState('MTH-GREEN-001');
  const [isGenerating, setIsGenerating] = useState(false);
  const [creativePack, setCreativePack] = useState<CreativePackState>({
    mainImage: {
      imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&auto=format&fit=crop&q=80',
      style: 'studio_white',
      aspectRatio: '1:1',
      dimensions: { width: 2000, height: 2000 },
      model: 'Flux-Dev-eCommerce-v2',
    },
    lifestyleImage: {
      lifestyleImageUrl: 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1200&auto=format&fit=crop&q=80',
      sceneType: 'modern_bathroom',
      lighting: 'soft_natural',
      composition: 'Product in foreground right with morning backlight',
    },
    infographic: {
      infographicImageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&auto=format&fit=crop&q=80',
      callouts: [
        { label: '插槽口径', value: '1.5" 超宽通用', badge: '适配 Oral-B & Sonicare' },
        { label: '产品净重', value: '3.57 磅 实心天然石', badge: '稳固不倾倒' },
        { label: '底座保护', value: '4 枚加厚 EVA 防滑垫', badge: '保护台面不刮伤' },
      ],
    },
    resizedVariants: [
      { preset: 'AMAZON_MAIN_SQUARE', width: 2000, height: 2000, format: 'JPEG (300 DPI)' },
      { preset: 'AMAZON_APLUS_HEADER', width: 970, height: 600, format: 'JPEG (150 DPI)' },
      { preset: 'MOBILE_SQUARE', width: 500, height: 500, format: 'WEBP (72 DPI)' },
    ],
    videoShowcase: {
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-modern-bathroom-interior-41584-large.mp4',
      durationSec: 15,
      storyboard: [
        { timestamp: '00:00-00:04', scene: '晨光柔和自然侧逆光下，缓慢推近天然大理石流线纹理' },
        { timestamp: '00:04-00:09', scene: '特写展示 1.5 英寸插槽轻松滑入 Oral-B 加粗电动牙刷柄' },
        { timestamp: '00:09-00:15', scene: '全景展示现代卫浴台面摆放，特写测试底座防滑平稳不晃动' },
      ],
    },
    totalCostUsd: 0.14,
    totalDurationMs: 420,
  });

  const handleGeneratePack = async () => {
    if (ApiClient.isViewer()) return;
    setIsGenerating(true);

    try {
      const data = await ApiClient.post<any>('/api/v1/creative/pack', {
        skuCode: selectedSku,
      });
      if (data) {
        setCreativePack(data);
      }
    } catch (err) {
      console.error('生成素材包失败:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="cp-title">素材中心</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                素材生产工作台
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              自动化素材流水线：白底棚拍主图 → 卫浴场景生活图 → 1.5&quot; 卖点标注图 → 多画幅尺寸裁剪 → 15秒展示短视频
            </p>
          </div>
        </div>

        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          <select
            value={selectedSku}
            onChange={(e) => setSelectedSku(e.target.value)}
            className="bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="MTH-GREEN-001">MTH-GREEN-001 (Carrara Green)</option>
            <option value="MTH-BLACK-002">MTH-BLACK-002 (Nero Marquina Black)</option>
            <option value="MTH-WHITE-003">MTH-WHITE-003 (Calacatta White)</option>
          </select>

          <button
            onClick={handleGeneratePack}
            disabled={isGenerating}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition shadow-md shadow-purple-600/20 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>正在协同 5 大工具渲染全套素材...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>一键生成素材包 (Creative Pack)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI & Workflow Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-gray-400 block">全套素材生产耗时</span>
            <span className="text-lg font-bold text-white font-mono">{creativePack.totalDurationMs} ms</span>
          </div>
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg">
            <Camera className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-gray-400 block">Token & 算力成本</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">${creativePack.totalCostUsd.toFixed(2)} USD</span>
          </div>
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-gray-400 block">Amazon 白底合规</span>
            <span className="text-lg font-bold text-emerald-400 flex items-center space-x-1">
              <ShieldCheck className="w-4 h-4" />
              <span>100% 达标</span>
            </span>
          </div>
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-gray-400 block">孔径与重量真实性</span>
            <span className="text-lg font-bold text-white">1.5&quot; / 3.57 磅</span>
          </div>
          <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-lg">
            <Layers className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 5-Asset Showcase Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset 1: Main Product Image */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-bold text-white">Amazon 主图 (Main Image)</h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-blue-500/20 text-blue-300">
              2000x2000 1:1
            </span>
          </div>

          <div className="relative group rounded-lg overflow-hidden border border-border aspect-square bg-surface-elevated">
            <img
              src={creativePack.mainImage.imageUrl}
              alt="Main Product"
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center space-x-2">
              <button className="p-2 rounded bg-white text-gray-900 text-xs font-medium flex items-center space-x-1 shadow cursor-pointer">
                <Download className="w-3.5 h-3.5" />
                <span>下载主图</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-gray-400 space-y-1">
            <p className="flex items-center justify-between">
              <span>底色规范:</span>
              <strong className="text-white font-mono">RGB(255, 255, 255) 纯白</strong>
            </p>
            <p className="flex items-center justify-between">
              <span>主体占比:</span>
              <strong className="text-emerald-400 font-mono">&gt; 85% 视口填充</strong>
            </p>
          </div>
        </div>

        {/* Asset 2: Lifestyle Image */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-purple-600/20 text-purple-400 text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-sm font-bold text-white">场景图 (Lifestyle Image)</h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-purple-500/20 text-purple-300">
              真实家居场景
            </span>
          </div>

          <div className="relative group rounded-lg overflow-hidden border border-border aspect-square bg-surface-elevated">
            <img
              src={creativePack.lifestyleImage.lifestyleImageUrl}
              alt="Lifestyle"
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center space-x-2">
              <button className="p-2 rounded bg-white text-gray-900 text-xs font-medium flex items-center space-x-1 shadow cursor-pointer">
                <Download className="w-3.5 h-3.5" />
                <span>下载场景图</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-gray-400 space-y-1">
            <p className="flex items-center justify-between">
              <span>空间环境:</span>
              <strong className="text-white">现代轻奢卫浴梳妆台</strong>
            </p>
            <p className="flex items-center justify-between">
              <span>光影氛围:</span>
              <strong className="text-white">晨雾柔和自然侧逆光</strong>
            </p>
          </div>
        </div>

        {/* Asset 3: Infographic Dimensions */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600/20 text-emerald-400 text-xs font-bold flex items-center justify-center">
                3
              </span>
              <h3 className="text-sm font-bold text-white">信息图 (Infographic)</h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-emerald-500/20 text-emerald-300">
              VOC 驱动
            </span>
          </div>

          <div className="p-3 bg-surface-elevated rounded-lg border border-border space-y-2.5">
            {creativePack.infographic.callouts.map((c: any, i: number) => (
              <div key={i} className="p-2.5 rounded bg-surface border border-border/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-500 block uppercase">{c.label}</span>
                  <span className="text-xs font-bold text-white">{c.value}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                  {c.badge}
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 flex items-start space-x-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
            <span>依据竞品 31% 电动牙刷孔径过窄退货痛点，图示明确标注 1.5 英寸超宽孔径，杜绝买家误解退货。</span>
          </div>
        </div>
      </div>

      {/* Lower Row: Video Showcase & Multi-aspect Resize Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Video Showcase (7 cols) */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center space-x-2">
              <Video className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">15秒展示短视频 (Video Short)</h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-purple-500/20 text-purple-300">
              1080P · 15s MP4
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="rounded-lg overflow-hidden border border-border aspect-video bg-black flex items-center justify-center relative">
              <video
                src={creativePack.videoShowcase.videoUrl}
                controls
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
                分镜脚本 (Storyboard)
              </span>
              <div className="space-y-1.5 text-xs text-gray-400">
                {creativePack.videoShowcase.storyboard.map((item: any, i: number) => (
                  <div key={i} className="p-2 rounded bg-surface-elevated border border-border">
                    <span className="text-[10px] text-purple-400 font-mono block">{item.timestamp}</span>
                    <span className="text-gray-300">{item.scene}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Multi-Aspect Resize Variants (5 cols) */}
        <div className="lg:col-span-5 bg-surface border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center space-x-2">
              <Scissors className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">多画幅尺寸裁剪矩阵 (Resize Matrix)</h3>
            </div>
          </div>

          <div className="space-y-3">
            {creativePack.resizedVariants.map((item: any, idx: number) => (
              <div
                key={idx}
                className="p-3 bg-surface-elevated rounded-lg border border-border flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-white block">{item.preset}</span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    {item.width} x {item.height} · {item.format}
                  </span>
                </div>
                <button className="px-2.5 py-1 bg-surface rounded border border-border hover:border-gray-600 text-gray-300 flex items-center space-x-1 transition cursor-pointer">
                  <Download className="w-3 h-3" />
                  <span>导出</span>
                </button>
              </div>
            ))}
          </div>

          <div className="pt-2 text-center">
            <a
              href="/app/tool-center"
              className="inline-flex items-center space-x-1 text-xs text-blue-400 hover:underline"
            >
              <span>在工具中心单点自定义裁剪与生图</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
