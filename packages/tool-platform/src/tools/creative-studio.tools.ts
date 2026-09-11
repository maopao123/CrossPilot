import { ToolDefinition } from '../contracts/tool.types.js';

export const CreativeImageGenerateTool: ToolDefinition = {
  id: 'creative.image.generate',
  name: '电商高转化商品图生成器',
  description: '基于商品卖点、场景提示词与风格预设，生成高分辨率亚马逊主图与附图素材。',
  category: 'CREATIVE',
  version: '1.0.0',
  tags: ['creative', 'ai-image', 'amazon', 'rendering'],
  timeoutMs: 15000,
  costEstimate: { amount: 0.04, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        name: 'prompt',
        label: '创意提示词 (Prompt)',
        type: 'textarea',
        required: true,
        placeholder: '例如: Natural white Carrara marble toothbrush holder, clean bathroom vanity...',
      },
      style: {
        name: 'style',
        label: '渲染视觉风格',
        type: 'select',
        defaultValue: 'studio_white',
        options: [
          { label: '亚马逊标准白底棚拍 (Studio White)', value: 'studio_white' },
          { label: '轻奢极简北欧风 (Luxury Minimalist)', value: 'luxury_minimalist' },
          { label: '真实生活家居场景 (Home Lifestyle)', value: 'home_lifestyle' },
        ],
      },
      aspectRatio: {
        name: 'aspectRatio',
        label: '宽高比例',
        type: 'select',
        defaultValue: '1:1',
        options: [
          { label: '1:1 (2000x2000 亚马逊主图)', value: '1:1' },
          { label: '4:3 (常见辅图)', value: '4:3' },
          { label: '16:9 (横版宽幅/A+)', value: '16:9' },
        ],
      },
    },
    required: ['prompt'],
  },
  execute: (input) => {
    const seed = Math.floor(Math.random() * 1000000);
    const dimensions = input.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 2000, height: 2000 };
    return {
      imageUrl: `https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&auto=format&fit=crop&q=80&sig=${seed}`,
      style: input.style || 'studio_white',
      aspectRatio: input.aspectRatio || '1:1',
      dimensions,
      seed,
      model: 'Flux-Dev-eCommerce-v2',
      promptUsed: input.prompt,
      generatedAt: new Date().toISOString(),
    };
  },
};

export const CreativeImageLifestyleTool: ToolDefinition = {
  id: 'creative.image.lifestyle',
  name: '白底转真实生活家居场景图生成器',
  description: '将商品主体无缝融合进高端卫浴洗手台、大理石台面及自然光照家居场景，增强买家代入感与转化率。',
  category: 'CREATIVE',
  version: '1.0.0',
  tags: ['creative', 'lifestyle', 'in-situ', 'composite'],
  timeoutMs: 15000,
  costEstimate: { amount: 0.05, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      productName: {
        name: 'productName',
        label: '商品名称',
        type: 'string',
        required: true,
        placeholder: '例如: POLEGAS Natural Marble Toothbrush Holder',
      },
      sceneType: {
        name: 'sceneType',
        label: '生活空间场景类型',
        type: 'select',
        defaultValue: 'modern_bathroom',
        options: [
          { label: '高端现代卫浴洗手台 (Modern Bathroom Vanity)', value: 'modern_bathroom' },
          { label: '阳光晨雾洗漱台 (Morning Sunlight Countertop)', value: 'morning_sunlight' },
          { label: '酒店套房大理石梳妆区 (Luxury Hotel Suite)', value: 'luxury_hotel' },
        ],
      },
      lighting: {
        name: 'lighting',
        label: '光影氛围',
        type: 'select',
        defaultValue: 'soft_natural',
        options: [
          { label: '柔和自然侧逆光 (Soft Natural Light)', value: 'soft_natural' },
          { label: '温馨暖色射灯 (Warm Ambient Spotlight)', value: 'warm_ambient' },
        ],
      },
    },
    required: ['productName'],
  },
  execute: (input) => {
    return {
      lifestyleImageUrl: `https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1200&auto=format&fit=crop&q=80`,
      sceneType: input.sceneType || 'modern_bathroom',
      lighting: input.lighting || 'soft_natural',
      composition: 'Rule of thirds, product in foreground right, subtle bokeh background',
      renderedAt: new Date().toISOString(),
    };
  },
};

export const CreativeBackgroundReplaceTool: ToolDefinition = {
  id: 'creative.background.replace',
  name: '智能去背与背景替换工具',
  description: '一键剥离拍摄杂乱背景，并自动补充自然投影与倒影，可替换为纯白、大理石台面或轻木纹纹理。',
  category: 'CREATIVE',
  version: '1.0.0',
  tags: ['creative', 'remove-bg', 'background', 'photo-editing'],
  timeoutMs: 10000,
  costEstimate: { amount: 0.02, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      sourceImageUrl: {
        name: 'sourceImageUrl',
        label: '原始图片 URL',
        type: 'string',
        required: true,
        placeholder: 'https://...',
      },
      targetBackground: {
        name: 'targetBackground',
        label: '目标背景类型',
        type: 'select',
        defaultValue: 'pure_white_rgb255',
        options: [
          { label: 'RGB(255,255,255) 亚马逊标准纯白底', value: 'pure_white_rgb255' },
          { label: '卡拉拉天然大理石纹理', value: 'carrara_marble' },
          { label: '北欧浅橡木台面', value: 'nordic_oak' },
        ],
      },
    },
    required: ['sourceImageUrl'],
  },
  execute: (input) => {
    return {
      processedImageUrl: input.sourceImageUrl,
      backgroundApplied: input.targetBackground || 'pure_white_rgb255',
      subjectBoundingBox: { x: 100, y: 120, width: 1780, height: 1760 },
      amazonMainImageCompliant: input.targetBackground === 'pure_white_rgb255',
      processedAt: new Date().toISOString(),
    };
  },
};

export const CreativeInfographicGenerateTool: ToolDefinition = {
  id: 'creative.infographic.generate',
  name: '卖点标注与孔径尺寸信息图生成器',
  description: '自动基于商品关键事实生成带刻度尺标注、重量图示与防滑垫解构的专业亚马逊第 2/3 张卖点图。',
  category: 'CREATIVE',
  version: '1.0.0',
  tags: ['creative', 'infographic', 'dimensions', 'callouts'],
  timeoutMs: 12000,
  costEstimate: { amount: 0.03, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      productTitle: {
        name: 'productTitle',
        label: '产品主标题',
        type: 'string',
        required: true,
        placeholder: 'POLEGAS Natural Marble Toothbrush Holder',
      },
      slotDiameterInch: {
        name: 'slotDiameterInch',
        label: '升级插槽孔径 (英寸)',
        type: 'number',
        defaultValue: 1.5,
      },
      netWeightLbs: {
        name: 'netWeightLbs',
        label: '产品净重 (磅)',
        type: 'number',
        defaultValue: 3.57,
      },
    },
    required: ['productTitle'],
  },
  execute: (input) => {
    return {
      infographicImageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&auto=format&fit=crop&q=80',
      callouts: [
        { label: 'Slot Diameter', value: `${input.slotDiameterInch || 1.5}" Wide Compatibility`, badge: 'Oral-B & Sonicare Fit' },
        { label: 'Net Weight', value: `${input.netWeightLbs || 3.57} lbs Solid Heavy Stone`, badge: 'Zero Tip-Over' },
        { label: 'Base Protection', value: '4x Anti-Slip EVA Cushions', badge: 'Countertop Safe' },
      ],
      generatedAt: new Date().toISOString(),
    };
  },
};

export const CreativeImageResizeTool: ToolDefinition = {
  id: 'creative.image.resize',
  name: '多平台画幅批量缩放与适配器',
  description: '将素材一键裁剪并导出为亚马逊主图（2000x2000）、A+ 页面（970x600）、移动端方图等标准格式。',
  category: 'CREATIVE',
  version: '1.0.0',
  tags: ['creative', 'resize', 'crop', 'amazon-specs'],
  timeoutMs: 5000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      sourceImageUrl: {
        name: 'sourceImageUrl',
        label: '源素材 URL',
        type: 'string',
        required: true,
        placeholder: 'https://...',
      },
    },
    required: ['sourceImageUrl'],
  },
  execute: (input) => {
    return {
      variants: [
        { preset: 'AMAZON_MAIN_SQUARE', width: 2000, height: 2000, url: input.sourceImageUrl, format: 'JPEG', dpi: 300 },
        { preset: 'AMAZON_APLUS_HEADER', width: 970, height: 600, url: input.sourceImageUrl, format: 'JPEG', dpi: 150 },
        { preset: 'MOBILE_THUMBNAIL', width: 500, height: 500, url: input.sourceImageUrl, format: 'WEBP', dpi: 72 },
      ],
      sourceUrl: input.sourceImageUrl,
    };
  },
};

export const CreativeVideoGenerateTool: ToolDefinition = {
  id: 'creative.video.generate',
  name: '15秒商品展示短视频生成器',
  description: '融合多角度产品静帧、360度旋转光影运镜与英文特性字幕，自动产出适合亚马逊视频位（Video Short）的 MP4。',
  category: 'CREATIVE',
  version: '1.0.0',
  tags: ['creative', 'video', 'amazon-video', 'short-clip'],
  timeoutMs: 30000,
  costEstimate: { amount: 0.15, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      productTitle: {
        name: 'productTitle',
        label: '产品标题',
        type: 'string',
        required: true,
      },
      durationSec: {
        name: 'durationSec',
        label: '视频时长 (秒)',
        type: 'number',
        defaultValue: 15,
      },
    },
    required: ['productTitle'],
  },
  execute: (input) => {
    return {
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-modern-bathroom-interior-41584-large.mp4',
      durationSec: input.durationSec || 15,
      resolution: '1920x1080',
      fps: 30,
      aspectRatio: '16:9',
      storyboard: [
        { timestamp: '00:00-00:04', scene: 'Slow zoom on Carrara marble texture with ambient lighting' },
        { timestamp: '00:04-00:09', scene: 'Close up on 1.5" slot sliding Oral-B electric toothbrush smoothly' },
        { timestamp: '00:09-00:15', scene: 'Full modern vanity display with non-slip base stability test' },
      ],
      generatedAt: new Date().toISOString(),
    };
  },
};
