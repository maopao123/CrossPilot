import { OpenAiCompatibleProvider, ListingPromptBuilder, ListingOutputStructuredSchema } from '../packages/ai/src/index.js';
import { SecretProvider } from '../packages/integrations/src/index.js';

async function test() {
  const apiKey = SecretProvider.getSecret('DEEPSEEK_API_KEY');
  const provider = new OpenAiCompatibleProvider({
    apiKey,
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
  });

  const prompt = ListingPromptBuilder.buildPrompt({
    brand: 'GFWARE',
    productName: 'Natural Marble Toothbrush Holder',
    variantName: 'Carrara White',
    marketplace: 'AMAZON_US',
    locale: 'en-US',
    features: [
      { id: 'f_mat', name: 'Material', value: '100% Genuine Natural Carrara Marble Stone', isCore: true },
      { id: 'f_slot', name: 'Slot Diameter', value: '1.5 inches (38mm) Wide Universal Compartments', isCore: true },
      { id: 'f_wt', name: 'Net Weight', value: '3.57 lbs (1.62 kg) Solid Heavy Base', isCore: true },
      { id: 'f_finish', name: 'Surface Finish', value: 'Sealed Polished Water-Resistant Finish', isCore: false },
      { id: 'f_pads', name: 'Base Protection', value: 'Cushioned Non-Slip EVA Countertop Pads', isCore: false },
    ],
    keywords: [
      { keyword: 'marble toothbrush holder', priority: 1, volume: 14500 },
      { keyword: 'electric toothbrush stand', priority: 1, volume: 9800 },
      { keyword: 'bathroom vanity organizer countertop', priority: 2, volume: 4200 },
    ],
    rufusQa: [
      {
        id: 'rufus-01',
        question: 'Does this toothbrush holder fit standard Oral-B and Sonicare electric toothbrush handles?',
        answer: 'Yes, the 1.5-inch wide slots comfortably accommodate standard manual and electric toothbrush handles.',
      },
      {
        id: 'rufus-02',
        question: 'Will it slide or tip over easily when pulling out a brush?',
        answer: 'No, weighing 3.57 lbs with non-slip EVA pads on the bottom, it stays firmly weighted on wet vanity counters.',
      },
    ],
    marketplaceProfile: {
      titleMaxLength: 200,
      bulletsCount: 5,
      searchTermsMaxLength: 250,
      forbiddenPatterns: ['fda approved', '#1 best seller'],
    },
  });

  console.log('Sending request to DeepSeek...');
  const res = await provider.generateText({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    outputSchema: ListingOutputStructuredSchema,
  }, { traceId: 'debug-trace-1' });

  console.log('Raw output received from DeepSeek:');
  console.log(res.rawText);

  const parsed = ListingOutputStructuredSchema.safeParse(res.output);
  if (!parsed.success) {
    console.error('Zod Parsing Errors:');
    console.error(JSON.stringify(parsed.error.issues, null, 2));
  } else {
    console.log('✅ Zod Parsing Succeeded!');
  }
}

test().catch(console.error);
