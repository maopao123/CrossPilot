/**
 * CrossPilot 统一模型路由配置（Aliyun DashScope 单厂商）。
 *
 * 所有模型名集中维护在此，业务代码引用常量而不是散落硬编码；
 * 后续新增/升级模型只改这一个文件。未被调用的模型（vision/video 部分）
 * 已预先收录，接入时直接从 ModelRouter 取值即可。
 *
 * 已实测验证（2026-09-13，scripts/verify-aliyun-models.mjs）：
 * - qwen3.8-max / qwen3.8-flash：compatible-mode /chat/completions 200
 * - qwen-image-3.0-pro：native 异步 /services/aigc/image-generation/generation 200（chat 式 input.messages）
 * 未实测（未调用，仅收录）：
 * - wan2.6-t2i（native endpoint 已路由，曾返回 429 限流而非模型错误）
 * - wan2.6-i2v / wan2.6-t2v（视频为分钟级异步任务，接入前不发起真实调用）
 */

/** OpenAI 兼容模式 Base URL（文本 LLM / Embedding 共用） */
export const ALIYUN_COMPAT_BASE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1';

/** DashScope 原生 API Base URL（图像/视频生成等异步任务） */
export const ALIYUN_NATIVE_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';

export const ModelRouter = {
  /** 文本 LLM 路由（compatible-mode /chat/completions） */
  llmRouter: {
    /** 重度推理：Listing 生成等核心链路 */
    heavyReasoning: 'qwen3.8-max',
    /** 快速任务：轻量分类/抽取/修复（当前无调用点，预留） */
    fastTask: 'qwen3.8-flash',
  },
  /** 视觉生成路由（native 异步图像生成） */
  visionRouter: {
    /** 电商主图/海报（当前已由 creative 图像工具调用） */
    ecommercePoster: 'qwen-image-3.0-pro',
    /** 场景背景图（当前仅收录，未调用） */
    sceneBackground: 'wan2.6-t2i',
  },
  /** 视频生成路由（native 异步视频合成；当前仅收录，未调用） */
  videoRouter: {
    imageToVideo: 'wan2.6-i2v',
    textToVideo: 'wan2.6-t2v',
  },
  /** Embedding 路由（compatible-mode /embeddings，已有调用，保持不变） */
  embeddingRouter: {
    knowledgeRag: 'text-embedding-v3',
  },
} as const;

export type ModelRouter = typeof ModelRouter;
