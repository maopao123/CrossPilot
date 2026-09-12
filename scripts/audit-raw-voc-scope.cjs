const { FirecrawlClient } = require('../packages/integrations/dist/provider-framework/providers/firecrawl/firecrawl.client.js');
const { FirecrawlMapper } = require('../packages/integrations/dist/provider-framework/providers/firecrawl/firecrawl.mapper.js');
const { SecretProvider } = require('../packages/integrations/dist/provider-framework/secrets/secret-provider.js');
const fs = require('fs');
const path = require('path');

async function audit() {
  SecretProvider.ensureEnvLoaded();
  const apiKey = SecretProvider.getSecret('FIRECRAWL_API_KEY');
  const client = new FirecrawlClient({ apiKey });
  
  const query = 'toothbrush holder marble bathroom';
  console.log('Query 1: ' + query + ' complaints reviews');
  const res1 = await client.search(query + ' complaints reviews', 15);
  console.log('Query 2: site:reddit.com ' + query);
  const res2 = await client.search('site:reddit.com ' + query, 10);

  const allItems = [...(res1.data || []), ...(res2.data || [])];
  const rawTexts = FirecrawlMapper.toRawTextItems(allItems);

  console.log('Total RawTextItems: ' + rawTexts.length);
  
  let exactCount = 0;
  let brandCount = 0;
  let categoryCount = 0;
  let genericCount = 0;

  const domains = {};
  const auditedItems = [];

  rawTexts.forEach((item, i) => {
    const textLower = item.text.toLowerCase();
    const urlLower = (item.url || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();
    const combined = textLower + ' ' + urlLower + ' ' + titleLower;

    let domain = 'unknown';
    try {
      domain = new URL(item.url).hostname;
    } catch (e) {}
    domains[domain] = (domains[domain] || 0) + 1;

    const hasAsin = combined.includes('b0bfgnsxyl');
    const hasBrand = combined.includes('gfware');
    const hasCategory = (combined.includes('marble') || combined.includes('stone') || combined.includes('resin')) && 
                        (combined.includes('toothbrush') || combined.includes('holder') || combined.includes('caddy'));
    const hasGeneric = combined.includes('toothbrush') || combined.includes('bathroom') || combined.includes('organizer');

    let scope = 'GENERIC';
    const matchedTerms = [];

    if (hasAsin) {
      scope = 'EXACT_PRODUCT';
      matchedTerms.push('B0BFGNSXYL');
      exactCount++;
    } else if (hasBrand) {
      scope = 'BRAND_PRODUCT';
      matchedTerms.push('GFWARE');
      brandCount++;
    } else if (hasCategory) {
      scope = 'CATEGORY';
      if (combined.includes('marble')) matchedTerms.push('marble');
      if (combined.includes('toothbrush holder')) matchedTerms.push('toothbrush holder');
      categoryCount++;
    } else {
      scope = 'GENERIC';
      if (combined.includes('bathroom')) matchedTerms.push('bathroom');
      if (combined.includes('organizer')) matchedTerms.push('organizer');
      genericCount++;
    }

    const auditEntry = {
      index: i + 1,
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      domain,
      url: item.url,
      title: item.title,
      scope,
      matchedTerms,
      textSnippet: item.text.slice(0, 140) + '...',
    };
    auditedItems.push(auditEntry);
    console.log(`[${i + 1}] Domain: ${domain.padEnd(20)} | Scope: ${scope.padEnd(14)} | Matched: [${matchedTerms.join(', ')}] | Title: ${(item.title || '').slice(0, 45)}`);
  });

  console.log('\n--- SUMMARY ---');
  console.log('EXACT_PRODUCT (ASIN B0BFGNSXYL):', exactCount);
  console.log('BRAND_PRODUCT (GFWARE):', brandCount);
  console.log('CATEGORY (marble toothbrush holder):', categoryCount);
  console.log('GENERIC (bathroom organizer / general):', genericCount);
  console.log('Domains:', JSON.stringify(domains, null, 2));

  // Write detailed audit dump
  fs.writeFileSync(
    path.join(__dirname, 'raw-voc-audit-data.json'),
    JSON.stringify({ auditedItems, summary: { exactCount, brandCount, categoryCount, genericCount, domains } }, null, 2),
    'utf-8'
  );
  console.log('Saved audit data to scripts/raw-voc-audit-data.json');
}

audit().catch(console.error);
