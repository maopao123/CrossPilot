/** Inspect a finished task's output structure and validate the image URL. */
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      for (const line of fs.readFileSync(candidate, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
loadEnvFile();
const apiKey = process.env.LLM_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.EMBEDDING_API_KEY || '';
const TASK_ID = process.argv[2] || '14c14e82-b71a-4c4f-b876-c1244f00aecc';

const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${TASK_ID}`, { headers: { Authorization: `Bearer ${apiKey}` } });
const json = await res.json();
console.log(JSON.stringify(json.output, null, 2).slice(0, 1200));

// dig url out of choices
const msg = json.output?.choices?.[0]?.message;
const part = msg?.content?.find?.((p) => p.type === 'image' && p.image) || msg?.content?.find?.((p) => p.image_url);
const url = part?.image || part?.image_url?.url || msg?.images?.[0]?.url;
console.log('\nEXTRACTED URL:', url);
if (url && url.startsWith('http')) {
  const img = await fetch(url);
  const buf = await img.arrayBuffer();
  console.log('image fetch:', img.status, img.headers.get('content-type'), buf.byteLength, 'bytes; first-bytes:', Buffer.from(buf.slice(0, 8)).toString('hex'));
}
