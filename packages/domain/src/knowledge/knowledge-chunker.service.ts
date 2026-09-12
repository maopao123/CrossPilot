import { KnowledgeChunk, KnowledgeDocument } from '@crosspilot/shared';

export interface ChunkerOptions {
  minChunkSize?: number;
  maxChunkSize?: number;
  embeddingVersion?: string;
}

export class KnowledgeChunkerService {
  /**
   * Split a Markdown or plaintext knowledge document into heading-aware atomic chunks
   */
  static chunkDocument(
    doc: KnowledgeDocument,
    options: ChunkerOptions = {},
  ): KnowledgeChunk[] {
    const minSize = options.minChunkSize || 150;
    const maxSize = options.maxChunkSize || 800;
    const embeddingVersion = options.embeddingVersion || 'dashscope-v3-1024';

    const rawLines = doc.content.split(/\r?\n/);
    const chunks: KnowledgeChunk[] = [];

    let currentHeading = doc.title;
    let currentSection = 'General';
    let currentParagraphs: string[] = [];
    let currentLength = 0;
    let chunkIndex = 0;

    const flushChunk = () => {
      if (currentParagraphs.length === 0) return;
      const content = currentParagraphs.join('\n\n').trim();
      if (content.length === 0) return;

      // Estimate tokens (~4 characters per token in English, 1-2 in Chinese)
      const tokenCount = Math.max(1, Math.round(content.length / 3.5));

      chunks.push({
        chunkId: `${doc.id}-c${chunkIndex + 1}`,
        documentId: doc.id,
        knowledgeType: doc.knowledgeType,
        sourceType: doc.sourceType,
        content,
        heading: currentHeading,
        section: currentSection,
        marketplace: doc.marketplace,
        category: doc.category,
        source: doc.source,
        sourceUrl: doc.sourceUrl,
        chunkIndex: chunkIndex++,
        tokenCount,
        embeddingVersion,
        metadata: {
          documentTitle: doc.title,
          version: doc.version,
          effectiveAt: doc.effectiveAt,
        },
        createdAt: new Date().toISOString(),
      });

      currentParagraphs = [];
      currentLength = 0;
    };

    for (const line of rawLines) {
      const trimmed = line.trim();

      // Heading detection
      if (/^#{1,4}\s+/.test(trimmed)) {
        // If current buffer already has content, flush before new heading
        if (currentLength >= minSize) {
          flushChunk();
        }
        currentHeading = trimmed.replace(/^#{1,4}\s+/, '');
        currentSection = currentHeading;
        continue;
      }

      if (trimmed.length === 0) {
        // Empty line separates paragraphs
        if (currentLength >= maxSize) {
          flushChunk();
        }
        continue;
      }

      currentParagraphs.push(trimmed);
      currentLength += trimmed.length;

      if (currentLength >= maxSize) {
        flushChunk();
      }
    }

    // Flush any remaining content
    if (currentParagraphs.length > 0) {
      flushChunk();
    }

    return chunks;
  }
}
