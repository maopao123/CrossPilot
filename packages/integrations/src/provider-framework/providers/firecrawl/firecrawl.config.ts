import {
  CapabilityBinding,
  IntegrationProviderDefinition,
} from '../../core/provider.types.js';

export const FIRECRAWL_PROVIDER_ID = 'firecrawl';

export const FIRECRAWL_PROVIDER_DEFINITION: IntegrationProviderDefinition = {
  id: FIRECRAWL_PROVIDER_ID,
  name: 'Firecrawl (External VOC & Discussions)',
  category: 'EXTERNAL_VOC',
  transport: 'HTTP',
  enabled: true,
  priority: 110, // Higher priority than XYDC (100) for text-level VOC
  timeoutMs: 20000,
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 800,
  },
  authRef: 'FIRECRAWL_API_KEY',
  endpointRef: 'https://api.firecrawl.dev/v1',
  metadata: {
    website: 'https://www.firecrawl.dev',
    providerType: 'EXTERNAL_WEB_FORUM_VOC',
    version: '1.0.0',
    vocSourceTypes: ['REDDIT', 'FORUM', 'REVIEWS', 'SOCIAL', 'WEB'],
  },
};

export const FIRECRAWL_CAPABILITY_BINDINGS: CapabilityBinding[] = [
  {
    capabilityId: 'voc.product.analyze',
    providerId: FIRECRAWL_PROVIDER_ID,
    transport: 'HTTP',
    remoteOperation: 'EXTERNAL_VOC_SEARCH',
    enabled: true,
    priority: 110, // Priority 110 ensures Router selects Firecrawl as Primary for Text VOC
    metadata: {
      status: 'LIVE',
      vocSourceType: 'EXTERNAL_VOC',
      description: '基于全网公开讨论、论坛 (Reddit/Forums) 与电商评测的真实文本级 VOC 挖掘',
      supportedDimensions: [
        'painPoints',
        'praisePoints',
        'buyerMotivations',
        'useCases',
        'questions',
        'desiredFeatures',
        'evidenceQuotes',
      ],
      unsupportedDimensions: [
        'averageRating',
        'totalReviewCount',
        'ratingDistribution',
        'sales',
      ],
    },
  },
];
