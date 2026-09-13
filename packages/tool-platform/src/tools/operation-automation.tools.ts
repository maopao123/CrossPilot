import { ToolDefinition } from '../contracts/tool.types.js';

export const OperationKeywordCombineTool: ToolDefinition = {
  id: 'operation.keyword.combine',
  name: '核心关键词矩阵笛卡尔组合与去重器',
  description: '自动对产品核心词根（如 toothbrush holder）、材质修饰词（marble, stone）及场景修饰词（countertop, vanity）进行矩阵组合与去重，生成 250 字节 Search Terms。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['operation', 'keywords', 'seo', 'search-terms'],
  timeoutMs: 5000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      seedKeywords: {
        name: 'seedKeywords',
        label: '核心词根 (逗号分隔)',
        type: 'string',
        required: true,
        defaultValue: 'toothbrush holder, toothbrush stand, electric caddy',
        placeholder: 'toothbrush holder, toothbrush stand, electric caddy',
      },
      modifiers: {
        name: 'modifiers',
        label: '修饰词与特性 (逗号分隔)',
        type: 'string',
        required: true,
        defaultValue: 'marble, heavy stone, wide slot, non slip, modern luxury',
        placeholder: 'marble, heavy stone, wide slot, non slip, modern luxury',
      },
    },
    required: ['seedKeywords', 'modifiers'],
  },
  execute: (input) => {
    const seeds = (input.seedKeywords || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const mods = (input.modifiers || '')
      .split(',')
      .map((m: string) => m.trim())
      .filter(Boolean);

    const combined: string[] = [];
    for (const seed of seeds) {
      for (const mod of mods) {
        combined.push(`${mod} ${seed}`);
      }
    }

    const uniqueWords = Array.from(
      new Set(
        `${input.seedKeywords} ${input.modifiers}`
          .toLowerCase()
          .replace(/[,\-_/]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2),
      ),
    );

    const searchTermsField = uniqueWords.slice(0, 30).join(' ');

    return {
      totalGenerated: combined.length,
      sampleKeywords: combined.slice(0, 10),
      searchTermsField,
      searchTermsByteLength: Buffer.byteLength(searchTermsField, 'utf8'),
      compliantWith250Bytes: Buffer.byteLength(searchTermsField, 'utf8') <= 250,
    };
  },
};

