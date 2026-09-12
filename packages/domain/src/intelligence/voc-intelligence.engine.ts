import type { VocIntelligenceInput, VocIntelligenceResult } from '@crosspilot/shared';

const PAIN = /\b(leak|broke|broken|cheap|smell|flimsy|difficult|hard to|poor|defect|return|crack|rust)\b/i;
const PRAISE = /\b(love|great|perfect|quality|sturdy|excellent|amazing|durable)\b/i;
const REQUEST = /\b(wish|need|should|want|please add|hope they)\b/i;

function cleanText(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 8) return null;
  return text;
}

function classify(text: string): 'PAIN_POINT' | 'PRAISE' | 'FEATURE_REQUEST' {
  if (PAIN.test(text)) return 'PAIN_POINT';
  if (REQUEST.test(text)) return 'FEATURE_REQUEST';
  if (PRAISE.test(text)) return 'PRAISE';
  return 'FEATURE_REQUEST';
}

export class VocIntelligenceEngine {
  analyze(input: VocIntelligenceInput): VocIntelligenceResult {
    const raw = [
      ...(input.reviews ?? []),
      ...(input.feedback ?? []),
      ...(input.listingText ? [input.listingText] : []),
    ];
    const cleanedTexts = raw.map(cleanText).filter((t): t is string => Boolean(t));
    const topics = cleanedTexts.map((text) => ({ topicType: classify(text), text }));
    const painPoints = topics.filter((t) => t.topicType === 'PAIN_POINT').map((t) => t.text);
    const praises = topics.filter((t) => t.topicType === 'PRAISE').map((t) => t.text);
    const requests = topics.filter((t) => t.topicType === 'FEATURE_REQUEST').map((t) => t.text);

    const topPain = painPoints[0] ?? '当前样本没有占主导的痛点。';
    const topPraise = praises[0] ?? '当前样本没有占主导的好评。';

    return {
      cleanedTexts,
      topics,
      painPoints,
      outputs: {
        productImprovement: painPoints.length
          ? `针对已反馈缺陷：${painPoints.slice(0, 3).join(' | ')}`
          : '当前 VOC 样本未形成缺陷聚类。',
        listingImprovement: `用实证带出「${topPraise}」。明确回应：${topPain}`,
        creativeBrief: `主图主张必须反驳「${topPain}」。社会认同角度：「${topPraise}」。`,
        customerServiceKnowledge: [
          `痛点：${painPoints.slice(0, 3).join('; ') || '无'}`,
          `好评：${praises.slice(0, 3).join('; ') || '无'}`,
          `需求：${requests.slice(0, 3).join('; ') || '无'}`,
        ].join('\n'),
      },
    };
  }
}
