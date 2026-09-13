/**
 * Live Connectivity Verification: Aliyun DashScope models for CrossPilot model swap.
 *
 * Verifies (cheap, minimal-token calls) that each configured model name is accepted
 * by the DashScope OpenAI-compatible endpoint. Video models (wan2.6-i2v/t2v) are
 * NOT invoked here — task creation costs money and takes minutes.
 *
 * Usage: node scripts/verify-aliyun-models.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function loadEnvFile() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      const lines = fs.readFileSync(candidate, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envFile = loadEnvFile();
const apiKey =
  process.env.LLM_API_KEY ||
  process.env.DASHSCOPE_API_KEY ||
  process.env.EMBEDDING_API_KEY ||
  '';
const keySource = process.env.LLM_API_KEY
  ? 'LLM_API_KEY'
  : process.env.DASHSCOPE_API_KEY
    ? 'DASHSCOPE_API_KEY'
    : process.env.EMBEDDING_API_KEY
      ? 'EMBEDDING_API_KEY'
      : null;

console.log('=== CrossPilot Aliyun Model Verification ===');
console.log(`env file : ${envFile || 'NOT FOUND'}`);
console.log(`base url : ${BASE_URL}`);
console.log(`api key  : ${keySource ? `${keySource} (SET, ${apiKey.length} chars)` : 'MISSING'}`);
if (!apiKey) {
  console.error('FAIL: no api key available'); process.exit(1);
}

async function post(endpoint, body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, latencyMs: Date.now() - t0, json, raw: text.slice(0, 400) };
}

function report(name, r, extra = '') {
  const ok = r.status === 200;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  [HTTP ${r.status}, ${r.latencyMs}ms] ${extra}`);
  if (!ok) console.log(`      -> ${r.raw}`);
  return ok;
}

let allOk = true;

// 1. Chat: heavy reasoning
{
  const r = await post('/chat/completions', {
    model: 'qwen3.8-max',
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    max_tokens: 8, temperature: 0,
  });
  const content = r.json?.choices?.[0]?.message?.content ?? '';
  allOk &= report('qwen3.8-max (chat/heavy_reasoning)', r, `reply="${String(content).slice(0, 40)}"`);
}

// 2. Chat: fast task
{
  const r = await post('/chat/completions', {
    model: 'qwen3.8-flash',
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    max_tokens: 8, temperature: 0,
  });
  const content = r.json?.choices?.[0]?.message?.content ?? '';
  allOk &= report('qwen3.8-flash (chat/fast_task)', r, `reply="${String(content).slice(0, 40)}"`);
}

// 3. Image: ecommerce poster
{
  const r = await post('/images/generations', {
    model: 'qwen-image-3.0-pro',
    prompt: 'A white natural marble toothbrush holder on a clean white studio background, product photography',
    size: '1024x1024', n: 1,
  });
  const d = r.json?.data?.[0];
  const shape = d ? (d.b64_json ? `b64(${Math.round(d.b64_json.length / 1024)}KB)` : d.url ? `url(${d.url.slice(0, 60)}...)` : 'empty') : 'none';
  allOk &= report('qwen-image-3.0-pro (image/ecommerce_poster)', r, `payload=${shape}`);
}

// 4. Image: scene background
{
  const r = await post('/images/generations', {
    model: 'wan2.6-t2i',
    prompt: 'Modern bright bathroom vanity with soft natural light, product photography background',
    size: '1024x1024', n: 1,
  });
  const d = r.json?.data?.[0];
  const shape = d ? (d.b64_json ? `b64(${Math.round(d.b64_json.length / 1024)}KB)` : d.url ? `url(${d.url.slice(0, 60)}...)` : 'empty') : 'none';
  allOk &= report('wan2.6-t2i (image/scene_background)', r, `payload=${shape}`);
}

console.log('---');
console.log(allOk ? 'ALL PASS' : 'SOME FAILED');
process.exit(allOk ? 0 : 2);
