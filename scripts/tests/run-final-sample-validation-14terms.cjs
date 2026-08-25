'use strict';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const fs = require('node:fs');
const path = require('node:path');

const { getCommercialNiche } = require('../commercial-niche-config.cjs');
const { getMarketplaceNicheContract } = require('../commercial-niche-contracts.cjs');

const { runAmazonScenarioDryRun } = require('../amazon-native-top20-v5.cjs');
const { GRAPHQL_CONTRACTS, normalizeProductOffer, createSignedRequest } = require('../shopee-openapi-shadow-engine-v1.cjs');
const { runMercadoLivreOfficialIntentCoverage, refreshAccessToken } = require('../mercadolivre-official-intents-v5.cjs');

const SAMPLE_MATRIX_14 = [
  {
    nicheId: 'casa_cozinha_organizacao',
    core: ['air fryer'],
    expansion: ['forno elétrico'],
  },
  {
    nicheId: 'beleza',
    core: ['protetor solar'],
    expansion: ['chapinha'],
  },
  {
    nicheId: 'moda',
    core: ['tênis feminino'],
    expansion: ['moletom'],
  },
  {
    nicheId: 'eletrodomesticos',
    core: ['geladeira'],
    expansion: ['lava-louças'],
  },
  {
    nicheId: 'informatica',
    core: ['notebook'],
    expansion: ['webcam'],
  },
  {
    nicheId: 'ferramentas',
    core: ['furadeira'],
    expansion: ['chave de impacto'],
  },
  {
    nicheId: 'pet',
    core: ['ração cachorro'],
    expansion: ['cama pet'],
  },
];

// Validação estrita de limites
const totalTermsCount = SAMPLE_MATRIX_14.reduce((acc, n) => acc + n.core.length + n.expansion.length, 0);
if (SAMPLE_MATRIX_14.length !== 7 || totalTermsCount !== 14) {
  console.error(`[ERRO FATAL] Amostra configurada inválida (${SAMPLE_MATRIX_14.length} nichos, ${totalTermsCount} termos). Abortando.`);
  process.exit(1);
}

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

function classifyProduct(title, price, nicheContract, searchTerm) {
  const normTitle = normalizeText(title);
  const normTerm = normalizeText(searchTerm);

  const allowedTerms = nicheContract?.guardrails?.allowedProductTerms || [];
  const blockedTerms = nicheContract?.guardrails?.blockedProductTerms || [];

  const numPrice = Number(price);
  if (!numPrice || numPrice <= 0 || isNaN(numPrice)) {
    return { classification: 'INVALID_PRICE', reason: 'price_missing_or_zero' };
  }

  // 1. Guardrails contextuais anti-falsos positivos por termo
  if (normTerm.includes('air fryer') || normTerm.includes('airfryer')) {
    const airFryerAccessories = [
      'forma para air fryer', 'forma descartavel', 'papel descartavel',
      'cesto em silicone', 'cesto de silicone', 'formas de silicone', 'forma de silicone',
      'assadeira air fryer', 'forro air fryer', 'tapete air fryer', 'protetor de air fryer',
      'protetor microondas', 'forma para fritadeira', 'grade para air fryer', 'adaptador resistente'
    ];
    if (airFryerAccessories.some((acc) => normTitle.includes(acc)) ||
        (normTitle.includes('forma') && !normTitle.includes('fritadeira') && !normTitle.includes('air fryer') && !normTitle.includes('airfryer')) ||
        (normTitle.includes('papel') && (normTitle.includes('air fryer') || normTitle.includes('airfryer'))) ||
        (normTitle.includes('cesto') && (normTitle.includes('air fryer') || normTitle.includes('airfryer')))) {
      return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_air_fryer' };
    }
  }

  if (normTerm === 'notebook') {
    const notebookAccessories = [
      'suporte para notebook', 'suporte articulado para notebook', 'base para notebook',
      'cooler para notebook', 'capa para notebook', 'mochila para notebook', 'adesivo para notebook',
      'carregador para notebook', 'fonte para notebook', 'suporte articulado'
    ];
    if (notebookAccessories.some((acc) => normTitle.includes(acc)) ||
        (normTitle.includes('suporte') && normTitle.includes('notebook')) ||
        (normTitle.includes('cooler') && normTitle.includes('notebook')) ||
        (normTitle.includes('base') && normTitle.includes('notebook') && !normTitle.includes('intel') && !normTitle.includes('ryzen'))) {
      return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_notebook' };
    }
  }

  if (normTerm === 'monitor') {
    const monitorAccessories = [
      'suporte articulado para monitor', 'braco para monitor', 'suporte para monitor',
      'suporte a gas para monitor', 'suporte de mesa para monitor', 'cabo para monitor',
      'adaptador para monitor', 'suporte monitor', 'braco articulado', 'suporte articulado a gas'
    ];
    if (monitorAccessories.some((acc) => normTitle.includes(acc)) ||
        (normTitle.includes('suporte') && normTitle.includes('monitor') && !normTitle.includes('gamer') && !normTitle.includes('ips') && !normTitle.includes('hz') && !normTitle.includes('led'))) {
      return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_monitor' };
    }
  }

  if (normTerm === 'webcam') {
    const webcamAccessories = [
      'tripe para webcam', 'suporte para webcam', 'ring light avulso', 'tripe articulado flexivel'
    ];
    if (webcamAccessories.some((acc) => normTitle.includes(acc)) ||
        (normTitle.includes('tripe') && !normTitle.includes('webcam full hd') && !normTitle.includes('webcam 1080p') && !normTitle.includes('camera'))) {
      return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_webcam' };
    }
  }

  if (normTerm === 'furadeira') {
    const drillAccessories = [
      'jogo de brocas', 'kit de brocas', 'kit brocas', 'brocas para furadeira',
      'jogo brocas', 'mandril avulso', 'disco lixa', 'suporte para furadeira lixadeira',
      'kit 30 discos'
    ];
    if (drillAccessories.some((acc) => normTitle.includes(acc)) ||
        (normTitle.includes('brocas') && !normTitle.includes('furadeira de impacto') && !normTitle.includes('parafusadeira furadeira')) ||
        (normTitle.includes('discos lixa'))) {
      return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_furadeira' };
    }
  }

  if (normTerm.includes('areia para gato')) {
    const catLitterAccessories = [
      'pa para areia', 'pa coletora', 'pa peneira', 'tapete higienico', 'tapete coletor',
      'caixa de areia', 'bandeja sanitaria', 'saco para bandeja', 'tira cheiro', 'sacos de recarga',
      'pa de areia'
    ];
    if (catLitterAccessories.some((acc) => normTitle.includes(acc)) &&
        !normTitle.includes('areia mineral') &&
        !normTitle.includes('areia higienica') &&
        !normTitle.includes('areia sanitaria') &&
        !normTitle.includes('granulado sanitario') &&
        !normTitle.includes('catbio') &&
        !normTitle.includes('mimocat')) {
      return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_areia_gato' };
    }
  }

  if (normTerm.includes('cama pet')) {
    const bedAccessories = [
      'tapete higienico', 'fralda pet', 'sanitario canino', 'jornal pet', 'educador adestrador',
      'areia catbio', 'areia higienica'
    ];
    if (bedAccessories.some((acc) => normTitle.includes(acc)) &&
        !normTitle.includes('cama') &&
        !normTitle.includes('caminha') &&
        !normTitle.includes('colchonete') &&
        !normTitle.includes('almofada pet')) {
      return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_cama_pet' };
    }
  }

  // 2. Bloqueios universais do nicho
  const hasBlocked = blockedTerms.some((term) => containsTerm(title, term));
  if (hasBlocked) {
    return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_or_part' };
  }

  // 3. Termos permitidos do nicho
  const hasAllowed = allowedTerms.length === 0 || allowedTerms.some((term) => containsTerm(title, term));
  if (!hasAllowed) {
    return { classification: 'OUT_OF_NICHE', reason: 'out_of_niche_scope' };
  }

  return { classification: 'RELEVANT', reason: null };
}

function classifySampleStatus(validCount, rawCount, rejectedCount, error) {
  if (error) return 'ERROR';
  if (rawCount > 0 && (rejectedCount / rawCount) > 0.5) return 'NOISY';
  if (validCount >= 2) return 'GOOD';
  if (validCount >= 1) return 'LIMITED';
  return 'EMPTY';
}

async function main() {
  console.log('[VALIDAÇÃO FINAL 14 TERMOS] 7 nichos / 14 termos / máximo 42 combinações...');

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
          signal: AbortSignal.timeout(15000),
        });
        return { status: res.status, data: await res.json() };
      },
    });
  }

  let mlAccessToken = null;
  try {
    mlAccessToken = await refreshAccessToken({ persist: false });
  } catch (mlErr) {
    console.warn(`[AVISO] ML access token indisponível: ${mlErr.message}`);
  }

  const results = [];
  let totalExecutions = 0;

  for (const sample of SAMPLE_MATRIX_14) {
    const { nicheId, core, expansion } = sample;
    const niche = getCommercialNiche(nicheId);
    console.log(`\n=== NICHO: ${niche.name} (${nicheId}) ===`);

    const contractAmazon = getMarketplaceNicheContract(nicheId, 'Amazon');
    const contractShopee = getMarketplaceNicheContract(nicheId, 'Shopee');
    const contractML = getMarketplaceNicheContract(nicheId, 'Mercado Livre');

    const terms = [
      ...core.map((t) => ({ term: t, tier: 'core' })),
      ...expansion.map((t) => ({ term: t, tier: 'expansion' })),
    ];

    for (const { term, tier } of terms) {
      console.log(`\n--- Termo [${tier.toUpperCase()}]: "${term}" ---`);

      const termData = {
        nicheId,
        tier,
        term,
        marketplaces: {},
      };

      // 1. Amazon (Máx 3 produtos)
      totalExecutions += 1;
      try {
        const amzRes = await runAmazonScenarioDryRun({
          scenario: {
            id: nicheId,
            scenarioId: nicheId,
            keywords: [term],
            browseNodeIds: contractAmazon?.amazonBrowseNodes || [],
            allowedProductTerms: contractAmazon?.guardrails?.allowedProductTerms || [],
            blockedProductTerms: contractAmazon?.guardrails?.blockedProductTerms || [],
          },
          candidateLimit: 3,
          minDelayMs: 300,
        });

        const rawList = (amzRes?.products || []).slice(0, 3);
        const processed = [];
        let valid = 0;

        for (const p of rawList) {
          const classInfo = classifyProduct(p.title, p.price, contractAmazon, term);
          const isAccepted = classInfo.classification === 'RELEVANT';
          if (isAccepted) valid += 1;

          processed.push({
            itemId: p.asin || 'unavailable',
            title: p.title || 'unavailable',
            price: p.price != null ? Number(p.price) : 'unavailable',
            accepted: isAccepted,
            rejectionReason: classInfo.reason,
          });
        }

        const raw = processed.length;
        const rejected = raw - valid;
        termData.marketplaces.Amazon = {
          rawCount: raw,
          validCount: valid,
          rejectedCount: rejected,
          status: classifySampleStatus(valid, raw, rejected, null),
          products: processed,
        };
      } catch (err) {
        termData.marketplaces.Amazon = {
          rawCount: 0,
          validCount: 0,
          rejectedCount: 0,
          status: 'ERROR',
          error: err.message,
          products: [],
        };
      }

      // 2. Shopee (Máx 3 produtos)
      totalExecutions += 1;
      if (shopeeRequest) {
        try {
          const shpRes = await shopeeRequest(
            'ShopeePromotionOffers',
            GRAPHQL_CONTRACTS.productOfferV2.query,
            {
              keyword: term,
              page: 1,
              limit: 3,
              sortType: 2,
              isAMSOffer: true,
            }
          );

          const rawNodes = (shpRes?.data?.data?.productOfferV2?.nodes || []).slice(0, 3);
          const processed = [];
          let valid = 0;

          for (const node of rawNodes) {
            const norm = normalizeProductOffer(node, { source: 'productOfferV2' });
            const p = norm.product;
            const classInfo = classifyProduct(p.productName, p.price, contractShopee, term);
            const isAccepted = classInfo.classification === 'RELEVANT';
            if (isAccepted) valid += 1;

            processed.push({
              itemId: String(p.itemId || 'unavailable'),
              title: p.productName || 'unavailable',
              price: p.price != null ? Number(p.price) : 'unavailable',
              accepted: isAccepted,
              rejectionReason: classInfo.reason,
            });
          }

          const raw = processed.length;
          const rejected = raw - valid;
          termData.marketplaces.Shopee = {
            rawCount: raw,
            validCount: valid,
            rejectedCount: rejected,
            status: classifySampleStatus(valid, raw, rejected, null),
            products: processed,
          };
        } catch (err) {
          termData.marketplaces.Shopee = {
            rawCount: 0,
            validCount: 0,
            rejectedCount: 0,
            status: 'ERROR',
            error: err.message,
            products: [],
          };
        }
      } else {
        termData.marketplaces.Shopee = {
          rawCount: 0,
          validCount: 0,
          rejectedCount: 0,
          status: 'ERROR',
          error: 'Credenciais Shopee indisponíveis',
          products: [],
        };
      }

      // 3. Mercado Livre (Máx 3 produtos com fallback de título seguro)
      totalExecutions += 1;
      if (mlAccessToken) {
        try {
          const mlRes = await runMercadoLivreOfficialIntentCoverage({
            accessToken: mlAccessToken,
            keywords: [term],
            maxPerIntent: 3,
            delayMs: 200,
          });

          const rawList = (mlRes?.products || []).slice(0, 3);
          const processed = [];
          let valid = 0;

          for (const p of rawList) {
            const title = p.product_name || p.name || p.title || null;
            const price = p.current_price != null ? Number(p.current_price) : (p.price != null ? Number(p.price) : null);
            const classInfo = classifyProduct(title, price, contractML, term);
            const isAccepted = classInfo.classification === 'RELEVANT';
            if (isAccepted) valid += 1;

            processed.push({
              itemId: String(p.product_id || p.item_id || p.id || 'unavailable'),
              title: title || 'unavailable',
              price: price != null ? price : 'unavailable',
              accepted: isAccepted,
              rejectionReason: classInfo.reason,
            });
          }

          const raw = processed.length;
          const rejected = raw - valid;
          termData.marketplaces['Mercado Livre'] = {
            rawCount: raw,
            validCount: valid,
            rejectedCount: rejected,
            status: classifySampleStatus(valid, raw, rejected, null),
            products: processed,
          };
        } catch (err) {
          termData.marketplaces['Mercado Livre'] = {
            rawCount: 0,
            validCount: 0,
            rejectedCount: 0,
            status: 'ERROR',
            error: err.message,
            products: [],
          };
        }
      } else {
        termData.marketplaces['Mercado Livre'] = {
          rawCount: 0,
          validCount: 0,
          rejectedCount: 0,
          status: 'ERROR',
          error: 'Token ML indisponível',
          products: [],
        };
      }

      // Print terminal report for this term
      ['Amazon', 'Shopee', 'Mercado Livre'].forEach((mkt) => {
        const m = termData.marketplaces[mkt];
        console.log(`  * ${mkt} (${m.validCount}/${m.rawCount} válidos) [${m.status}]:`);
        if (!m.products || m.products.length === 0) {
          console.log(`    - 0 produtos (${m.error || 'sem resultados'})`);
        } else {
          m.products.forEach((p) => {
            const tag = p.accepted ? 'ACCEPTED' : `REJECTED [${p.rejectionReason}]`;
            const priceStr = typeof p.price === 'number' ? `R$ ${p.price.toFixed(2)}` : 'R$ unavailable';
            console.log(`    - [${tag}] ${p.title} | ${priceStr} | ID: ${p.itemId}`);
          });
        }
      });

      results.push(termData);
    }
  }

  // Gravar resultado final
  const reportsDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const reportPath = path.join(reportsDir, 'final-sample-validation-14terms.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'final_sample_validation_14terms',
    totalNiches: 7,
    totalTerms: 14,
    totalExecutions,
    writes: { supabase: 0, offers: 0, posts: 0, publications: 0 },
    terms: results,
  }, null, 2));

  console.log(`\n[VALIDAÇÃO CONCLUÍDA] Total de chamadas: ${totalExecutions} | Relatório salvo em: ${reportPath}`);
}

main().catch((err) => {
  console.error(`[ERRO FATAL NA VALIDAÇÃO FINAL] ${err.message}`);
  process.exitCode = 1;
});
