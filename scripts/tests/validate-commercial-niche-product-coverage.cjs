'use strict';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { COMMERCIAL_NICHES, COMMERCIAL_NICHE_IDS, getCommercialNiche } = require('../commercial-niche-config.cjs');
const { getMarketplaceNicheContract } = require('../commercial-niche-contracts.cjs');
const { buildNicheMarketplacePlan } = require('../commercial-niche-runtime-adapter.cjs');

const { runAmazonScenarioDryRun } = require('../amazon-native-top20-v5.cjs');
const { GRAPHQL_CONTRACTS, normalizeProductOffer, createSignedRequest } = require('../shopee-openapi-shadow-engine-v1.cjs');
const { runMercadoLivreOfficialIntentCoverage, refreshAccessToken } = require('../mercadolivre-official-intents-v5.cjs');

function normalizeText(val) {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsTerm(haystack, needle) {
  const normH = ` ${normalizeText(haystack)} `;
  const normN = ` ${normalizeText(needle)} `;
  return normN.trim() ? normH.includes(normN) : false;
}

function classifyProduct(title, price, nicheContract) {
  const allowedTerms = nicheContract?.guardrails?.allowedProductTerms || [];
  const blockedTerms = nicheContract?.guardrails?.blockedProductTerms || [];

  const numPrice = Number(price);
  if (!numPrice || numPrice <= 0 || isNaN(numPrice)) {
    return { classification: 'INVALID_PRICE', reason: 'price_missing_or_zero' };
  }

  const hasBlocked = blockedTerms.some((term) => containsTerm(title, term));
  if (hasBlocked) {
    return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_or_part' };
  }

  const hasAllowed = allowedTerms.length === 0 || allowedTerms.some((term) => containsTerm(title, term));
  if (!hasAllowed) {
    return { classification: 'OUT_OF_NICHE', reason: 'out_of_niche_scope' };
  }

  return { classification: 'RELEVANT', reason: null };
}

function determineTermStatus(validCount, rawCount, rejectedCount, error) {
  if (error) return 'ERROR';
  if (rawCount > 0 && ((rawCount - validCount) / rawCount) > 0.5) {
    return 'NOISY';
  }
  if (validCount >= 5) return 'STRONG';
  if (validCount >= 2) return 'ACCEPTABLE';
  if (validCount === 1) return 'WEAK';
  return 'EMPTY';
}

async function main() {
  console.log('[VALIDAÇÃO DE COBERTURA REAL DOS 7 NICHOS] Iniciando execução read-only...');

  // Setup Shopee signed request
  const shopeeAppId = process.env.SHOPEE_APP_ID;
  const shopeeAppSecret = process.env.SHOPEE_APP_SECRET;
  let shopeeRequest = null;

  if (shopeeAppId && shopeeAppSecret) {
    shopeeRequest = createSignedRequest({
      appId: shopeeAppId,
      appSecret: shopeeAppSecret,
      request: async ({ body, headers }) => {
        const res = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(30000),
        });
        return { status: res.status, data: await res.json() };
      },
    });
  } else {
    console.warn('[AVISO] Credenciais da Shopee não encontradas no ambiente.');
  }

  // Setup Mercado Livre token
  let mlAccessToken = null;
  try {
    mlAccessToken = await refreshAccessToken({ persist: false });
  } catch (mlErr) {
    console.warn(`[AVISO] Falha ao obter access token Mercado Livre: ${mlErr.message}`);
  }

  const allNicheResults = [];

  for (const nicheId of COMMERCIAL_NICHE_IDS) {
    const niche = getCommercialNiche(nicheId);
    console.log(`\n==================================================\nNICHO: ${niche.name} (${nicheId})\n==================================================`);

    const coreTerms = niche.coreProducts;
    const expansionTerms = niche.expansionProducts;

    const termResults = [];
    const allUniqueValidProducts = new Map();

    const termsToTest = [
      ...coreTerms.map((t) => ({ term: t, tier: 'core' })),
      ...expansionTerms.map((t) => ({ term: t, tier: 'expansion' })),
    ];

    for (const { term, tier } of termsToTest) {
      process.stdout.write(`  Testando [${tier.toUpperCase()}] "${term}"... `);

      const termExecution = {
        nicheId,
        tier,
        term,
        marketplaces: {},
      };

      // 1. AMAZON
      try {
        const amazonStart = Date.now();
        const contractAmazon = getMarketplaceNicheContract(nicheId, 'Amazon');
        const amazonRes = await runAmazonScenarioDryRun({
          scenario: {
            id: nicheId,
            scenarioId: nicheId,
            keywords: [term],
            browseNodeIds: contractAmazon?.amazonBrowseNodes || [],
            allowedProductTerms: contractAmazon?.guardrails?.allowedProductTerms || [],
            blockedProductTerms: contractAmazon?.guardrails?.blockedProductTerms || [],
          },
          candidateLimit: 10,
          minDelayMs: 600,
        });

        const rawList = amazonRes?.products || [];
        const processedProducts = [];
        let validCount = 0;
        const seenAsins = new Set();

        for (const p of rawList) {
          const id = p.asin || p.canonical_url;
          if (seenAsins.has(id)) continue;
          seenAsins.add(id);

          const classificationInfo = classifyProduct(p.title, p.price, contractAmazon);
          const isAccepted = classificationInfo.classification === 'RELEVANT';
          if (isAccepted) validCount += 1;

          const prod = {
            nicheId,
            tier,
            searchTerm: term,
            marketplace: 'Amazon',
            itemId: p.asin || 'unavailable',
            title: p.title || 'unavailable',
            currentPrice: p.price != null ? Number(p.price) : 'unavailable',
            originalPrice: p.original_price != null ? Number(p.original_price) : 'unavailable',
            discount: p.discount != null ? Number(p.discount) : 'unavailable',
            rating: p.rating != null ? Number(p.rating) : 'unavailable',
            reviewCount: 'unavailable',
            salesQuantity: 'unavailable',
            availability: 'in_stock',
            seller: p.seller || 'unavailable',
            category: 'Amazon BestSellers/Search',
            browseNodeId: contractAmazon?.amazonBrowseNodes?.[0] || 'unavailable',
            url: p.canonical_url || p.source_url || 'unavailable',
            imageUrl: p.image || 'unavailable',
            rank: p.rank || 'unavailable',
            accepted: isAccepted,
            classification: classificationInfo.classification,
            rejectionReasons: classificationInfo.reason ? [classificationInfo.reason] : [],
          };

          processedProducts.push(prod);
          if (isAccepted) {
            allUniqueValidProducts.set(`Amazon_${prod.itemId}`, prod);
          }
        }

        const rawCount = processedProducts.length;
        const status = determineTermStatus(validCount, rawCount, rawCount - validCount, null);

        termExecution.marketplaces.Amazon = {
          rawProducts: rawCount,
          validProducts: validCount,
          rejectedProducts: rawCount - validCount,
          uniqueProducts: seenAsins.size,
          relevanceRate: rawCount > 0 ? Number(((validCount / rawCount) * 100).toFixed(1)) : 0,
          latencyMs: Date.now() - amazonStart,
          error: null,
          status,
          products: processedProducts,
        };
      } catch (amzErr) {
        termExecution.marketplaces.Amazon = {
          rawProducts: 0,
          validProducts: 0,
          rejectedProducts: 0,
          uniqueProducts: 0,
          relevanceRate: 0,
          latencyMs: 0,
          error: amzErr.message,
          status: 'ERROR',
          products: [],
        };
      }

      // 2. SHOPEE
      if (shopeeRequest) {
        try {
          const shopeeStart = Date.now();
          const contractShopee = getMarketplaceNicheContract(nicheId, 'Shopee');
          const categoryIds = contractShopee?.shopeeApiCategories || [];

          const response = await shopeeRequest(
            'ShopeePromotionOffers',
            GRAPHQL_CONTRACTS.productOfferV2.query,
            {
              keyword: term,
              page: 1,
              limit: 20,
              sortType: 2,
              isAMSOffer: true,
            }
          );

          const rawNodes = response?.data?.data?.productOfferV2?.nodes || [];
          const processedProducts = [];
          let validCount = 0;
          const seenItemIds = new Set();

          for (const node of rawNodes) {
            const norm = normalizeProductOffer(node, { source: 'productOfferV2' });
            const p = norm.product;
            const id = p.itemId;
            if (seenItemIds.has(id)) continue;
            seenItemIds.add(id);

            const classificationInfo = classifyProduct(p.productName, p.price, contractShopee);
            const isAccepted = classificationInfo.classification === 'RELEVANT';
            if (isAccepted) validCount += 1;

            const prod = {
              nicheId,
              tier,
              searchTerm: term,
              marketplace: 'Shopee',
              itemId: String(p.itemId || 'unavailable'),
              title: p.productName || 'unavailable',
              currentPrice: p.price != null ? Number(p.price) : 'unavailable',
              originalPrice: p.priceMax != null && Number(p.priceMax) > Number(p.price) ? Number(p.priceMax) : 'unavailable',
              discount: p.priceDiscountRate != null ? Number(p.priceDiscountRate) : 'unavailable',
              rating: p.ratingStar != null ? Number(p.ratingStar) : 'unavailable',
              reviewCount: 'unavailable',
              salesQuantity: p.sales != null ? Number(p.sales) : 'unavailable',
              availability: 'in_stock',
              seller: p.shopId ? `Shop ${p.shopId}` : 'unavailable',
              category: p.productCatIds?.[0] ? `Cat ${p.productCatIds[0]}` : 'unavailable',
              productCatId: p.productCatIds?.[0] || 'unavailable',
              url: p.offerLink || p.productLink || 'unavailable',
              imageUrl: p.imageUrl || 'unavailable',
              rank: 'unavailable',
              accepted: isAccepted,
              classification: classificationInfo.classification,
              rejectionReasons: classificationInfo.reason ? [classificationInfo.reason] : [],
            };

            processedProducts.push(prod);
            if (isAccepted) {
              allUniqueValidProducts.set(`Shopee_${prod.itemId}`, prod);
            }
          }

          const rawCount = processedProducts.length;
          const status = determineTermStatus(validCount, rawCount, rawCount - validCount, null);

          termExecution.marketplaces.Shopee = {
            rawProducts: rawCount,
            validProducts: validCount,
            rejectedProducts: rawCount - validCount,
            uniqueProducts: seenItemIds.size,
            relevanceRate: rawCount > 0 ? Number(((validCount / rawCount) * 100).toFixed(1)) : 0,
            latencyMs: Date.now() - shopeeStart,
            error: null,
            status,
            products: processedProducts,
          };
        } catch (shpErr) {
          termExecution.marketplaces.Shopee = {
            rawProducts: 0,
            validProducts: 0,
            rejectedProducts: 0,
            uniqueProducts: 0,
            relevanceRate: 0,
            latencyMs: 0,
            error: shpErr.message,
            status: 'ERROR',
            products: [],
          };
        }
      } else {
        termExecution.marketplaces.Shopee = {
          rawProducts: 0,
          validProducts: 0,
          rejectedProducts: 0,
          uniqueProducts: 0,
          relevanceRate: 0,
          latencyMs: 0,
          error: 'Credenciais Shopee indisponíveis no ambiente local',
          status: 'ERROR',
          products: [],
        };
      }

      // 3. MERCADO LIVRE
      if (mlAccessToken) {
        try {
          const mlStart = Date.now();
          const contractML = getMarketplaceNicheContract(nicheId, 'Mercado Livre');
          const mlRes = await runMercadoLivreOfficialIntentCoverage({
            accessToken: mlAccessToken,
            keywords: [term],
            maxPerIntent: 10,
            delayMs: 250,
          });

          const rawList = mlRes?.products || [];
          const processedProducts = [];
          let validCount = 0;
          const seenMlIds = new Set();

          for (const p of rawList) {
            const id = p.product_id || p.item_id || p.id;
            if (seenMlIds.has(id)) continue;
            seenMlIds.add(id);

            const classificationInfo = classifyProduct(p.product_name, p.current_price, contractML);
            const isAccepted = classificationInfo.classification === 'RELEVANT';
            if (isAccepted) validCount += 1;

            const prod = {
              nicheId,
              tier,
              searchTerm: term,
              marketplace: 'Mercado Livre',
              itemId: String(id || 'unavailable'),
              title: p.product_name || 'unavailable',
              currentPrice: p.current_price != null ? Number(p.current_price) : 'unavailable',
              originalPrice: p.old_price != null ? Number(p.old_price) : 'unavailable',
              discount: p.old_price && p.current_price ? Number((((p.old_price - p.current_price) / p.old_price) * 100).toFixed(1)) : 'unavailable',
              rating: 'unavailable',
              reviewCount: 'unavailable',
              salesQuantity: p.sold_quantity != null ? Number(p.sold_quantity) : 'unavailable',
              availability: 'in_stock',
              seller: p.seller_id ? `Seller ${p.seller_id}` : 'unavailable',
              category: p.category_id || 'unavailable',
              domainId: p.domain_id || 'unavailable',
              url: p.product_url || p.permalink || 'unavailable',
              imageUrl: p.image_url || 'unavailable',
              rank: p.position || 'unavailable',
              accepted: isAccepted,
              classification: classificationInfo.classification,
              rejectionReasons: classificationInfo.reason ? [classificationInfo.reason] : [],
            };

            processedProducts.push(prod);
            if (isAccepted) {
              allUniqueValidProducts.set(`ML_${prod.itemId}`, prod);
            }
          }

          const rawCount = processedProducts.length;
          const status = determineTermStatus(validCount, rawCount, rawCount - validCount, null);

          termExecution.marketplaces['Mercado Livre'] = {
            rawProducts: rawCount,
            validProducts: validCount,
            rejectedProducts: rawCount - validCount,
            uniqueProducts: seenMlIds.size,
            relevanceRate: rawCount > 0 ? Number(((validCount / rawCount) * 100).toFixed(1)) : 0,
            latencyMs: Date.now() - mlStart,
            error: null,
            status,
            products: processedProducts,
          };
        } catch (mlErr) {
          termExecution.marketplaces['Mercado Livre'] = {
            rawProducts: 0,
            validProducts: 0,
            rejectedProducts: 0,
            uniqueProducts: 0,
            relevanceRate: 0,
            latencyMs: 0,
            error: mlErr.message,
            status: 'ERROR',
            products: [],
          };
        }
      } else {
        termExecution.marketplaces['Mercado Livre'] = {
          rawProducts: 0,
          validProducts: 0,
          rejectedProducts: 0,
          uniqueProducts: 0,
          relevanceRate: 0,
          latencyMs: 0,
          error: 'Access token do Mercado Livre indisponível',
          status: 'ERROR',
          products: [],
        };
      }

      // Consolidado do termo
      const validTotal = (termExecution.marketplaces.Amazon?.validProducts || 0) +
        (termExecution.marketplaces.Shopee?.validProducts || 0) +
        (termExecution.marketplaces['Mercado Livre']?.validProducts || 0);

      const isCoveredConsolidated = (termExecution.marketplaces.Amazon?.validProducts >= 2) ||
        (termExecution.marketplaces.Shopee?.validProducts >= 2) ||
        (termExecution.marketplaces['Mercado Livre']?.validProducts >= 2);

      termExecution.consolidated = {
        validTotal,
        isCovered: isCoveredConsolidated,
        status: isCoveredConsolidated ? (validTotal >= 10 ? 'STRONG' : 'ACCEPTABLE') : (validTotal === 1 ? 'WEAK' : 'EMPTY'),
      };

      termResults.push(termExecution);
      console.log(`OK (Válidos: Amz=${termExecution.marketplaces.Amazon?.validProducts || 0}, Shp=${termExecution.marketplaces.Shopee?.validProducts || 0}, ML=${termExecution.marketplaces['Mercado Livre']?.validProducts || 0} | Consolidado=${termExecution.consolidated.status})`);
    }

    // Métricas consolidadas do nicho
    const coreResults = termResults.filter((t) => t.tier === 'core');
    const expansionResults = termResults.filter((t) => t.tier === 'expansion');

    const coreCovered = coreResults.filter((t) => t.consolidated.isCovered).length;
    const expansionCovered = expansionResults.filter((t) => t.consolidated.isCovered).length;

    const coreCoveragePercent = Number(((coreCovered / coreTerms.length) * 100).toFixed(1));
    const expansionCoveragePercent = Number(((expansionCovered / expansionTerms.length) * 100).toFixed(1));

    let nicheStatus = 'INSUFFICIENT_COVERAGE';
    if (coreCoveragePercent >= 80) nicheStatus = 'READY_FOR_EVALUATION';
    else if (coreCoveragePercent >= 50) nicheStatus = 'PARTIAL_COVERAGE';

    const wellCoveredTerms = termResults.filter((t) => t.consolidated.isCovered).map((t) => t.term);
    const weakTerms = termResults.filter((t) => t.consolidated.status === 'WEAK').map((t) => t.term);
    const emptyTerms = termResults.filter((t) => t.consolidated.status === 'EMPTY').map((t) => t.term);
    const noisyTerms = termResults.filter((t) => Object.values(t.marketplaces).some((m) => m.status === 'NOISY')).map((t) => t.term);

    // Cobertura por Marketplace
    const coverageByMarketplace = {};
    for (const mkt of ['Amazon', 'Shopee', 'Mercado Livre']) {
      const mktCoreValid = coreResults.filter((t) => (t.marketplaces[mkt]?.validProducts || 0) >= 2).length;
      const mktExpValid = expansionResults.filter((t) => (t.marketplaces[mkt]?.validProducts || 0) >= 2).length;
      coverageByMarketplace[mkt] = {
        coreCoveragePercent: Number(((mktCoreValid / coreTerms.length) * 100).toFixed(1)),
        expansionCoveragePercent: Number(((mktExpValid / expansionTerms.length) * 100).toFixed(1)),
      };
    }

    allNicheResults.push({
      nicheId,
      nicheName: niche.name,
      nicheStatus,
      coreTermCount: coreTerms.length,
      coreCovered,
      coreCoveragePercent,
      expansionTermCount: expansionTerms.length,
      expansionCovered,
      expansionCoveragePercent,
      totalUniqueValidProducts: allUniqueValidProducts.size,
      coverageByMarketplace,
      wellCoveredTerms,
      weakTerms,
      emptyTerms,
      noisyTerms,
      terms: termResults,
      validProductsSample: Array.from(allUniqueValidProducts.values()),
    });
  }

  // Geração dos relatórios
  const reportsDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const jsonReportPath = path.join(reportsDir, 'commercial-niche-product-coverage.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'real_product_coverage_validation',
    writes: { supabase: 0, offers: 0, posts: 0, publications: 0 },
    niches: allNicheResults,
  }, null, 2));

  // Geração do relatório markdown
  let mdContent = `# Relatório Real de Cobertura de Produtos — 7 Nichos Comerciais\n\n`;
  mdContent += `Data de geração: ${new Date().toISOString()}\n`;
  mdContent += `Modo: Estritamente Read-Only (Zero Persistência, Zero Supabase Writes)\n\n`;

  mdContent += `## Tabela Resumo dos 7 Nichos\n\n`;
  mdContent += `| Nicho | Core % | Expansion % | Produtos Únicos Válidos | Termos Weak | Termos Empty | Termos Noisy | Status |\n`;
  mdContent += `|---|:---:|:---:|:---:|---|---|---|:---:|\n`;

  for (const nr of allNicheResults) {
    mdContent += `| **${nr.nicheName}** (\`${nr.nicheId}\`) | **${nr.coreCoveragePercent}%** | **${nr.expansionCoveragePercent}%** | **${nr.totalUniqueValidProducts}** | ${nr.weakTerms.join(', ') || 'Nenhum'} | ${nr.emptyTerms.join(', ') || 'Nenhum'} | ${nr.noisyTerms.join(', ') || 'Nenhum'} | \`${nr.nicheStatus}\` |\n`;
  }

  mdContent += `\n---\n\n## Detalhamento de Produtos por Nicho e Termo\n\n`;

  for (const nr of allNicheResults) {
    mdContent += `### Nicho: ${nr.nicheName} (\`${nr.nicheId}\`)\n`;
    mdContent += `- **Status**: \`${nr.nicheStatus}\` | Cobertura Core: ${nr.coreCoveragePercent}% | Cobertura Expansion: ${nr.expansionCoveragePercent}%\n`;
    mdContent += `- **Amazon**: Core ${nr.coverageByMarketplace.Amazon.coreCoveragePercent}% / Exp ${nr.coverageByMarketplace.Amazon.expansionCoveragePercent}%\n`;
    mdContent += `- **Shopee**: Core ${nr.coverageByMarketplace.Shopee.coreCoveragePercent}% / Exp ${nr.coverageByMarketplace.Shopee.expansionCoveragePercent}%\n`;
    mdContent += `- **Mercado Livre**: Core ${nr.coverageByMarketplace['Mercado Livre'].coreCoveragePercent}% / Exp ${nr.coverageByMarketplace['Mercado Livre'].expansionCoveragePercent}%\n\n`;

    for (const t of nr.terms) {
      mdContent += `#### [${t.tier.toUpperCase()}] Termo: "${t.term}" (Status: \`${t.consolidated.status}\` | Válidos: ${t.consolidated.validTotal})\n\n`;

      for (const mkt of ['Amazon', 'Shopee', 'Mercado Livre']) {
        const mktData = t.marketplaces[mkt];
        mdContent += `**${mkt}** (${mktData.validProducts} válidos / ${mktData.rawProducts} brutos):\n`;
        const validProds = (mktData.products || []).filter((p) => p.accepted);
        if (validProds.length === 0) {
          mdContent += `- *0 produtos válidos encontrados*\n`;
        } else {
          for (const p of validProds.slice(0, 5)) {
            const priceStr = typeof p.currentPrice === 'number' ? `R$ ${p.currentPrice.toFixed(2)}` : 'R$ unavailable';
            const ratingStr = p.rating !== 'unavailable' ? ` ⭐ ${p.rating}` : '';
            const salesStr = p.salesQuantity !== 'unavailable' ? ` (${p.salesQuantity} vendas)` : '';
            mdContent += `- **${p.title}** — ${priceStr}${ratingStr}${salesStr} [ID: \`${p.itemId}\`]\n`;
          }
        }
        mdContent += `\n`;
      }
    }
    mdContent += `---\n\n`;
  }

  const mdReportPath = path.join(reportsDir, 'commercial-niche-product-coverage.md');
  fs.writeFileSync(mdReportPath, mdContent);

  console.log(`\n[SUCESSO] Relatórios gerados em:`);
  console.log(`  - JSON: ${jsonReportPath}`);
  console.log(`  - Markdown: ${mdReportPath}`);
}

main().catch((err) => {
  console.error(`[ERRO FATAL NA EXECUÇÃO] ${err.message}`);
  process.exitCode = 1;
});
