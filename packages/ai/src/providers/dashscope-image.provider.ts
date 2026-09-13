import { SecretProvider } from '@crosspilot/integrations';
import { ModelRouter, ALIYUN_NATIVE_BASE_URL } from '@crosspilot/shared';

export interface DashScopeImageResult {
  imageUrl: string;
  taskId: string;
  model: string;
  finishedAt: string;
}

export interface DashScopeImageOptions {
  apiKey?: string;
  model?: string;
  /** native 尺寸格式，如 '1024*1024' */
  size?: string;
  /** 提交 + 轮询的总超时预算（真实生成约 30-90s） */
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * DashScope 原生异步图像生成 Provider。
 *
 * 背景（2026-09-13 实测，见 scripts/verify-aliyun-models.mjs / probe-dashscope-image.mjs）：
 * - compatible-mode 的 /images/generations 路由不存在（404，与模型无关）；
 * - qwen-image-3.0-pro / wan2.6-t2i 走 native /services/aigc/image-generation/generation，
 *   入参为 chat 式 input.messages（content 必须是 parts 列表）；
 * - 结果为异步任务，轮询 /api/v1/tasks/{taskId}，图片在 choices[0].message.content[]
 *   中 type==='image' 的 part.image（带签名的临时 OSS URL）。
 */
export class DashScopeImageProvider {
  readonly id = 'dashscope-image';
  private readonly config: {
    apiKey?: string;
    model: string;
    baseUrl: string;
  };

  constructor(options: DashScopeImageOptions = {}) {
    this.config = {
      apiKey:
        options.apiKey ||
        SecretProvider.getSecret('IMAGE_API_KEY') ||
        SecretProvider.getSecret('DASHSCOPE_API_KEY') ||
        // 同厂商单 Key 场景：与 LLM/Embedding 共用
        SecretProvider.getSecret('EMBEDDING_API_KEY') ||
        undefined,
      model:
        options.model ||
        SecretProvider.getSecret('IMAGE_MODEL') ||
        ModelRouter.visionRouter.ecommercePoster,
      baseUrl: (SecretProvider.getSecret('DASHSCOPE_NATIVE_BASE_URL') || ALIYUN_NATIVE_BASE_URL).replace(/\/+$/, ''),
    };
  }

  getModel(): string {
    return this.config.model;
  }

  /** 文生图 */
  async generateImage(
    prompt: string,
    options: DashScopeImageOptions = {},
  ): Promise<DashScopeImageResult> {
    const content = [{ type: 'text', text: prompt }];
    return this.runTask({ messages: [{ role: 'user', content }] }, options);
  }

  /** 图生图 / 图像编辑（如背景替换）：传入参考图 URL + 指令 */
  async editImage(
    sourceImageUrl: string,
    prompt: string,
    options: DashScopeImageOptions = {},
  ): Promise<DashScopeImageResult> {
    const content = [
      { type: 'image', image: sourceImageUrl },
      { type: 'text', text: prompt },
    ];
    return this.runTask({ messages: [{ role: 'user', content }] }, options);
  }

  private async runTask(
    input: { messages: unknown[] },
    options: DashScopeImageOptions,
  ): Promise<DashScopeImageResult> {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      throw new Error(
        'DashScope image API key not configured. Set IMAGE_API_KEY or DASHSCOPE_API_KEY.',
      );
    }

    const model = options.model || this.config.model;
    const size = options.size || '1024*1024';
    const timeoutMs = options.timeoutMs || 150000;
    const pollIntervalMs = options.pollIntervalMs || 3000;

    const submitRes = await fetch(
      `${this.config.baseUrl}/services/aigc/image-generation/generation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model,
          input,
          parameters: { size, n: 1 },
        }),
      },
    );

    const submitBody: any = await submitRes.json().catch(() => ({}));
    const taskId = submitBody?.output?.task_id as string | undefined;
    if (!submitRes.ok || !taskId) {
      const msg = submitBody?.message || submitBody?.error?.message || `HTTP ${submitRes.status}`;
      throw new Error(`DashScope image submit failed: ${msg}`);
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const pollRes = await fetch(`${this.config.baseUrl}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const pollBody: any = await pollRes.json().catch(() => ({}));
      const status = pollBody?.output?.task_status;

      if (status === 'SUCCEEDED') {
        const parts: any[] = pollBody?.output?.choices?.[0]?.message?.content || [];
        const imagePart = parts.find((p: any) => p?.type === 'image' && p.image);
        if (!imagePart?.image) {
          throw new Error(
            `DashScope image task ${taskId} succeeded but no image in output: ${JSON.stringify(pollBody?.output).slice(0, 200)}`,
          );
        }
        return {
          imageUrl: imagePart.image,
          taskId,
          model,
          finishedAt: pollBody?.output?.end_time || new Date().toISOString(),
        };
      }

      if (status === 'FAILED' || pollBody?.code) {
        const msg = pollBody?.output?.message || pollBody?.message || JSON.stringify(pollBody).slice(0, 200);
        throw new Error(`DashScope image task ${taskId} failed: ${msg}`);
      }
    }

    throw new Error(`DashScope image task ${taskId} timed out after ${timeoutMs}ms`);
  }
}
