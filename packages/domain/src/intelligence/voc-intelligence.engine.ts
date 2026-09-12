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

    const topPain = painPoints[0] ?? 'No dominant pain point in the provided sample.';
    const topPraise = praises[0] ?? 'No dominant praise in the provided sample.';

    return {
      cleanedTexts,
      topics,
      painPoints,
      outputs: {
        productImprovement: painPoints.length
          ? `Address reported defects: ${painPoints.slice(0, 3).join(' | ')}`
          : 'No defect cluster from current VOC sample.',
        listingImprovement: `Lead with proof of ${topPraise}. Explicitly answer: ${topPain}`,
        creativeBrief: `Hero claim must rebut "${topPain}". Social proof angle: "${topPraise}".`,
        customerServiceKnowledge: [
          `Pain: ${painPoints.slice(0, 3).join('; ') || 'n/a'}`,
          `Praise: ${praises.slice(0, 3).join('; ') || 'n/a'}`,
          `Requests: ${requests.slice(0, 3).join('; ') || 'n/a'}`,
        ].join('\n'),
      },
    };
  }
}
