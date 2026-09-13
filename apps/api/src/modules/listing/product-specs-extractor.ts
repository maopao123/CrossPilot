export interface ProductSpecsExtractResult {
  extractor: 'LLM' | 'HEURISTIC';
  model?: string;
  productName: string;
  brand: string;
  color: string;
  material: string;
  dimensions: string;
  weight: string;
  capacity: string;
  features: string[];
  featuresText: string;
}

const NOISE_RE = /after-sales|customer service|warranty|contact us|24\/7 customer/i;
const LABEL_LINE_RE =
  /^(color|colour|material|brand|product dimensions|dimensions|weight|capacity|size)\b/i;
const HEADER_LINE_RE = /^[A-Z0-9][A-Z0-9 /&-]{2,}:\s+\S/;
const DIMENSION_TRIPLE_RE =
  /(\d+(?:\.\d+)?)\s*["']?\s*L?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*["']?\s*W?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*["']?\s*H?/g;

function trimStr(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function labeledValue(text: string, keys: string[]): string {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:${keys.join('|')})[：:\\s]+([^\\r\\n]+)`,
    'i',
  );
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function isNoise(text: string): boolean {
  return NOISE_RE.test(text);
}

function formatTriple(a: string, b: string, c: string): string {
  return `${a}" × ${b}" × ${c}"`;
}

function collectDimensions(rawText: string): string {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hits: { triples: string[]; score: number }[] = [];

  for (const line of lines) {
    const triples: string[] = [];
    const re = new RegExp(DIMENSION_TRIPLE_RE.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      triples.push(formatTriple(match[1], match[2], match[3]));
    }
    if (triples.length === 0) continue;

    let score = 0;
    if (/dimension/i.test(line) && line.length > 40) score += 5;
    if (/unit|organizer|combined|cabinet/i.test(line)) score += 3;
    if (triples.some((triple) => /\d\.\d/.test(triple))) score += 3;
    if (/product\s+dimensions/i.test(line) && line.length < 80) score += 1;
    hits.push({ triples, score });
  }

  if (hits.length === 0) {
    return labeledValue(rawText, ['product dimensions', 'dimensions']);
  }

  hits.sort((a, b) => b.score - a.score);
  return [...new Set(hits[0].triples)].join(' / ');
}

function collectCapacity(rawText: string): string {
  const parts: string[] = [];
  const pack = rawText.match(/\b(\d+)\s*pack\b/i);
  if (pack) parts.push(`${pack[1]} Pack`);
  const pairs =
    rawText.match(/fits\s+(\d+)\s+pairs/i) ||
    rawText.match(/hold[s]?\s+(?:up\s+to\s+)?(\d+)\s+pairs/i);
  if (pairs) parts.push(`Holds up to ${pairs[1]} pairs`);
  return [...new Set(parts)].join(' / ');
}

function collectProductName(lines: string[]): string {
  for (const line of lines) {
    if (LABEL_LINE_RE.test(line)) continue;
    if (HEADER_LINE_RE.test(line)) continue;
    if (isNoise(line)) continue;
    if (line.length >= 24) return line;
  }
  return '';
}

function collectFeatures(lines: string[]): string[] {
  const features: string[] = [];
  for (const line of lines) {
    if (!HEADER_LINE_RE.test(line)) continue;
    if (isNoise(line)) continue;
    features.push(line);
  }
  return features;
}

function joinNonEmpty(parts: Array<string | undefined>, sep = ' / '): string {
  return parts.map((part) => trimStr(part)).filter(Boolean).join(sep);
}

function formatFeatures(features: string[]): string {
  return features.map((feature) => (feature.startsWith('•') ? feature : `• ${feature}`)).join('\n');
}

export function finalizeProductSpecs(
  raw: {
    productName?: unknown;
    brand?: unknown;
    color?: unknown;
    material?: unknown;
    dimensions?: unknown;
    weight?: unknown;
    capacity?: unknown;
    features?: unknown;
  },
  extractor: 'LLM' | 'HEURISTIC',
  model?: string,
): ProductSpecsExtractResult {
  const color = trimStr(raw.color);
  const material = joinNonEmpty([trimStr(raw.material), color ? `Color: ${color}` : '']);
  const capacity = trimStr(raw.capacity);
  const weight = joinNonEmpty([trimStr(raw.weight), capacity]);
  const features = Array.isArray(raw.features)
    ? raw.features.map((item) => trimStr(item)).filter((item) => item && !isNoise(item))
    : [];

  return {
    extractor,
    model,
    productName: trimStr(raw.productName),
    brand: trimStr(raw.brand),
    color,
    material,
    dimensions: trimStr(raw.dimensions),
    weight,
    capacity,
    features,
    featuresText: formatFeatures(features),
  };
}

export function heuristicExtractProductSpecs(rawText: string): ProductSpecsExtractResult {
  const text = (rawText || '').trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  return finalizeProductSpecs(
    {
      productName: collectProductName(lines),
      brand: labeledValue(text, ['brand']),
      color: labeledValue(text, ['color', 'colour']),
      material: labeledValue(text, ['material']),
      dimensions: collectDimensions(text),
      weight: labeledValue(text, ['weight', 'net weight']),
      capacity: collectCapacity(text) || labeledValue(text, ['capacity']),
      features: collectFeatures(lines),
    },
    'HEURISTIC',
  );
}

export function parseProductSpecsFromLlm(
  parsed: unknown,
  model?: string,
): ProductSpecsExtractResult | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;
  const features = Array.isArray(data.features) ? data.features : [];
  const hasSignal =
    Boolean(trimStr(data.productName)) ||
    Boolean(trimStr(data.material)) ||
    Boolean(trimStr(data.dimensions)) ||
    features.length > 0;
  if (!hasSignal) return null;
  return finalizeProductSpecs(data, 'LLM', model);
}

export function parseJsonObject(rawText: string): unknown {
  const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}
