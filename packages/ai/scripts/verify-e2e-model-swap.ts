/**
 * Post-swap E2E re-verification (run after the qwen3.8 model swap):
 *  1. Text LLM: OpenAiCompatibleProvider with NO explicit config — proves the
 *     env resolution chain (EMBEDDING_API_KEY -> Aliyun compatible-mode -> qwen3.8-max)
 *     and response_format json_object on qwen3.8-max, plus 'AUTO' normalization.
 *  2. Image: real creative.image.generate through ToolExecutor (qwen-image-3.0-pro,
 *     native async task, ~30-90s).
 *
 * Usage: pnpm --filter @crosspilot/db exec tsx scripts/verify-e2e-model-swap.ts
 */
import { z } from 'zod';
import {
  OpenAiCompatibleProvider,
  PlatformLlmRuntime,
} from '../src/index.js';
import {
  createDefaultToolRegistry,
  ToolExecutor,
} from '../../tool-platform/src/index.js';
import { SecretProvider } from '../../integrations/src/index.js';
import { ModelRouter, ALIYUN_COMPAT_BASE_URL } from '../../shared/src/index.js';

async function main() {
  let failures = 0;
  const check = (label: string, cond: boolean, detail = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
    if (!cond) failures++;
  };

  // ---------- 1. Text LLM via pure env resolution ----------
  console.log('=== 1. Text LLM (env-driven resolution) ===');
  const provider = new OpenAiCompatibleProvider();
  const runtime = new PlatformLlmRuntime({ provider });

  const EchoSchema = z.object({ ok: z.boolean(), model: z.string() });
  const r1 = await runtime.generateText(
    {
      systemPrompt: 'You are a JSON echo service. Reply with JSON only.',
      userPrompt: `Reply with JSON: {"ok": true, "model": "${ModelRouter.llmRouter.heavyReasoning}"}`,
      outputSchema: EchoSchema,
      temperature: 0,
      maxTokens: 60,
      timeoutMs: 30000,
    },
    { traceId: 'e2e-text' },
  );
  check(
    'qwen3.8-max chat + json_object schema',
    r1.output.ok === true && r1.model === ModelRouter.llmRouter.heavyReasoning,
    `model=${r1.model} latency=${r1.latencyMs}ms tokens=${r1.usage.totalTokens}`,
  );

  // AUTO normalization: 'AUTO' must resolve to the router default, not a literal model name
  const r2 = await runtime.generateText(
    {
      model: 'AUTO',
      systemPrompt: 'You are a JSON echo service. Reply with JSON only.',
      userPrompt: `Reply with JSON: {"ok": true, "model": "${ModelRouter.llmRouter.heavyReasoning}"}`,
      outputSchema: EchoSchema,
      temperature: 0,
      maxTokens: 60,
      timeoutMs: 30000,
    },
    { traceId: 'e2e-auto' },
  );
  check(
    "'AUTO' modelName normalized to router default",
    r2.model === ModelRouter.llmRouter.heavyReasoning,
    `model=${r2.model}`,
  );

  // fast_task model sanity (cheap)
  const r3 = await runtime.generateText(
    {
      model: ModelRouter.llmRouter.fastTask,
      systemPrompt: 'You are a JSON echo service. Reply with JSON only.',
      userPrompt: 'Reply with JSON: {"ok": true, "model": "qwen3.8-flash"}',
      outputSchema: EchoSchema,
      temperature: 0,
      maxTokens: 60,
      timeoutMs: 30000,
    },
    { traceId: 'e2e-flash' },
  );
  check('qwen3.8-flash reachable', r3.output.ok === true, `model=${r3.model}`);

  const resolvedKey =
    SecretProvider.getSecret('LLM_API_KEY') ||
    SecretProvider.getSecret('DASHSCOPE_API_KEY') ||
    SecretProvider.getSecret('EMBEDDING_API_KEY') ||
    '';
  console.log(`      resolved key: ${resolvedKey ? 'present' : 'MISSING'}, base url target: ${ALIYUN_COMPAT_BASE_URL}`);

  // ---------- 2. Real image tool ----------
  console.log('\n=== 2. creative.image.generate (real qwen-image-3.0-pro, ~30-90s) ===');
  const registry = createDefaultToolRegistry();
  const executor = new ToolExecutor(registry);
  const imgStart = Date.now();
  const imgRes = await executor.execute(
    'creative.image.generate',
    {
      prompt: 'Natural white Carrara marble toothbrush holder, clean bathroom vanity',
      style: 'studio_white',
      aspectRatio: '1:1',
    },
    { workspaceId: 'ws_e2e_verify', source: 'TOOL_CENTER' },
  );
  const imgData: any = imgRes.data;
  check(
    'creative.image.generate success',
    imgRes.success === true &&
      typeof imgData?.imageUrl === 'string' &&
      (imgData.imageUrl.startsWith('http') || imgData.imageUrl.startsWith('/assets')),
    `model=${imgData?.model} taskId=${imgData?.taskId} url=${imgData?.imageUrl} duration=${Date.now() - imgStart}ms`,
  );
  if (!imgRes.success) {
    console.log('      error:', JSON.stringify(imgRes.error));
  }

  if (imgData?.imageUrl) {
    const targetUrl = imgData.imageUrl.startsWith('/')
      ? `http://127.0.0.1:2222${imgData.imageUrl}`
      : imgData.imageUrl;
    const head = await fetch(targetUrl);
    check('generated image downloadable', head.ok, `HTTP ${head.status} ${head.headers.get('content-type')}`);
  }


  console.log('\n=== Summary ===');
  console.log(failures === 0 ? 'ALL E2E CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
