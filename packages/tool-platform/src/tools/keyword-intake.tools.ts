import { ToolDefinition } from '../contracts/tool.types.js';
import { KeywordItem, KeywordSource } from '@crosspilot/domain';

export const KeywordFileExtractTool: ToolDefinition = {
  id: 'keyword.file.extract',
  name: '多格式关键词文件抽取解析器',
  description: '支持 Manual、TXT、CSV/Excel 格式。针对多列文件自动识别关键词列并提取检索量与优先级，忽略无关列，防止数据污染。',
  category: 'OPERATION',
  version: '2.0.0',
  tags: ['keyword', 'file', 'csv', 'excel', 'intake', 'search-term'],
  timeoutMs: 10000,
  costEstimate: { amount: 0.005, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        name: 'content',
        label: '文件内容 (文本或 CSV 内容)',
        type: 'textarea',
        required: true,
        defaultValue: 'marble toothbrush holder\nelectric toothbrush stand\nbathroom countertop caddy',
        placeholder: '粘贴 TXT 或 CSV/Excel 导出内容...',
      },
      sourceType: {
        name: 'sourceType',
        label: '数据源类型',
        type: 'select',
        defaultValue: 'MANUAL',
        options: [
          { label: '手动直接输入 (Manual)', value: 'MANUAL' },
          { label: '纯文本文件 (TXT)', value: 'TXT' },
          { label: 'Excel / CSV 报表 (EXCEL)', value: 'EXCEL' },
        ],
      },
    },
    required: ['content'],
  },
  execute: (input: { content: string; sourceType?: KeywordSource }) => {
    const rawContent = input.content || '';
    const source: KeywordSource = input.sourceType || 'MANUAL';
    const lines = rawContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      return {
        totalLines: 0,
        extractedCount: 0,
        keywords: [],
        message: 'No keyword content provided.',
      };
    }

    const items: KeywordItem[] = [];

    // Check if CSV with header
    const firstLine = lines[0];
    const isCsv = firstLine.includes(',') || firstLine.includes('\t') || firstLine.includes(';');
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

    if (isCsv && lines.length > 1) {
      const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/["']/g, ''));
      let kwColIdx = headers.findIndex((h) =>
        h.includes('keyword') || h.includes('search term') || h.includes('query') || h.includes('关键词') || h.includes('搜索词'),
      );
      if (kwColIdx === -1) kwColIdx = 0; // fallback to 1st column

      let volColIdx = headers.findIndex((h) =>
        h.includes('volume') || h.includes('search volume') || h.includes('搜索量') || h.includes('周搜索'),
      );
      let prioColIdx = headers.findIndex((h) =>
        h.includes('priority') || h.includes('优先级') || h.includes('rank'),
      );

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(delimiter).map((col) => col.trim().replace(/^["']|["']$/g, ''));
        const rawKw = row[kwColIdx];
        if (!rawKw) continue;

        const volume = volColIdx !== -1 && row[volColIdx] ? parseInt(row[volColIdx].replace(/[^\d]/g, ''), 10) || undefined : undefined;
        const priority = prioColIdx !== -1 && row[prioColIdx] ? parseInt(row[prioColIdx].replace(/[^\d]/g, ''), 10) || undefined : undefined;

        items.push({
          keyword: rawKw,
          normalizedKeyword: rawKw.toLowerCase().trim().replace(/\s+/g, ' '),
          source,
          volume,
          priority: priority || (volume && volume > 8000 ? 1 : 2),
          metadata: { rowIndex: i },
        });
      }
    } else {
      // Plain lines (TXT or single column Manual)
      lines.forEach((line, idx) => {
        // Clean line numbers like "1. keyword"
        const cleaned = line.replace(/^\d+[\.\、\)]\s*/, '').trim();
        if (cleaned) {
          items.push({
            keyword: cleaned,
            normalizedKeyword: cleaned.toLowerCase().trim().replace(/\s+/g, ' '),
            source,
            priority: 2,
            metadata: { lineIndex: idx },
          });
        }
      });
    }

    return {
      totalLines: lines.length,
      extractedCount: items.length,
      keywords: items,
      message: `Successfully extracted ${items.length} candidate keywords from ${source} file.`,
    };
  },
};

export const KeywordNormalizeTool: ToolDefinition = {
  id: 'keyword.normalize',
  name: '关键词标准化与去重处理器',
  description: '清洗关键词中的特殊标点、无意义停用词，统一大小写，并依据搜索量与优先级进行全局去重。',
  category: 'OPERATION',
  version: '2.0.0',
  tags: ['keyword', 'normalize', 'deduplicate', 'cleanse'],
  timeoutMs: 5000,
  costEstimate: { amount: 0.001, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      keywords: {
        name: 'keywords',
        label: '待清洗关键词列表 (JSON 或 文本)',
        type: 'textarea',
        required: true,
        defaultValue: 'marble toothbrush holder\nMARBLE TOOTHBRUSH HOLDER\nelectric toothbrush stand!!\nbathroom countertop caddy',
        placeholder: '每行输入一个关键词，或以换行分隔',
      },
    },
    required: ['keywords'],
  },
  execute: (input: { keywords: KeywordItem[] | string[] | string }) => {
    let rawList: Array<KeywordItem | string> = [];
    if (typeof input.keywords === 'string') {
      try {
        const parsed = JSON.parse(input.keywords);
        rawList = Array.isArray(parsed) ? parsed : [input.keywords];
      } catch {
        rawList = input.keywords.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      }
    } else if (Array.isArray(input.keywords)) {
      rawList = input.keywords;
    }

    const seen = new Set<string>();
    const normalizedList: KeywordItem[] = [];

    rawList.forEach((item) => {
      const original = typeof item === 'string' ? item : item.keyword;
      if (!original) return;

      // Cleanse punctuation and duplicate spaces
      const cleaned = original
        .toLowerCase()
        .replace(/[^\w\s"-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleaned || seen.has(cleaned)) return;
      seen.add(cleaned);

      if (typeof item === 'string') {
        normalizedList.push({
          keyword: original,
          normalizedKeyword: cleaned,
          source: 'MANUAL',
          priority: 2,
        });
      } else {
        normalizedList.push({
          ...item,
          keyword: item.keyword,
          normalizedKeyword: cleaned,
        });
      }
    });

    // Sort by priority (1 before 2 before 3) then volume desc
    normalizedList.sort((a, b) => {
      const pA = a.priority ?? 99;
      const pB = b.priority ?? 99;
      if (pA !== pB) return pA - pB;
      const vA = a.volume ?? 0;
      const vB = b.volume ?? 0;
      return vB - vA;
    });

    return {
      inputCount: rawList.length,
      normalizedCount: normalizedList.length,
      deduplicatedCount: rawList.length - normalizedList.length,
      keywords: normalizedList,
    };
  },
};
