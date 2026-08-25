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

const SAMPLE_MATRIX = [
  {
    nicheId: 'casa_cozinha_organizacao',
    core: ['air fryer', 'organizador de cozinha'],
    expansion: ['forno elétrico'],
  },
  {
    nicheId: 'beleza',
    core: ['protetor solar', 'tratamento capilar'],
    expansion: ['chapinha'],
  },
  {
    nicheId: 'moda',
    core: ['tênis feminino', 'vestido'],
    expansion: ['moletom'],
  },
  {
    nicheId: 'eletrodomesticos',
    core: ['geladeira', 'máquina de lavar'],
    expansion: ['lava-louças'],
  },
  {
    nicheId: 'informatica',
    core: ['notebook', 'monitor'],
    expansion: ['webcam'],
  },
  {
    nicheId: 'ferramentas',
    core: ['parafusadeira', 'furadeira'],
    expansion: ['chave de impacto'],
  },
  {
    nicheId: 'pet',
    core: ['ração cachorro', 'areia para gato'],
    expansion: ['cama pet'],
  },
];

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

  // 1. Guardrails de Acessórios Específicos por Termo de Busca (Evitar falsos positivos)
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

  // 2. Bloqueios Universais do Contrato de Nicho
  const hasBlocked = blockedTerms.some((term) => containsTerm(title, term));
  if (hasBlocked) {
    return { classification: 'ACCESSORY_OR_PART', reason: 'blocked_accessory_or_part' };
  }

  // 3. Termos Permitidos do Contrato de Nicho
  const hasAllowed = allowedTerms.length === 0 || allowedTerms.some((term) => containsTerm(title, term));
  if (!hasAllowed) {
    return { classification: 'OUT_OF_NICHE', reason: 'out_of_niche_scope' };
  }

  return { classification: 'RELEVANT', reason: null };
}

function classifySampleStatus(validCount, rawCount, rejectedCount, error) {
  if (error) return 'ERROR';
  if (rawCount > 0 && (rejectedCount / rawCount) > 0.5) return 'NOISY';
  if (validCount >= 3) return 'GOOD';
  if (validCount >= 1) return 'LIMITED';
  return 'EMPTY';
}

async function main() {
  console.log('[TESTE AMOSTRAL 7 NICHOS - V2 CALIBRADA] Iniciando validação 2 Core + 1 Expansion (21 termos)...');

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

  const nicheReports = [];
  const allSampleProducts = [];

  for (const sample of SAMPLE_MATRIX) {
    const { nicheId, core, expansion } = sample;
    const niche = getCommercialNiche(nicheId);
    console.log(`\n=== NICHO: ${niche.name} (${nicheId}) ===`);

    const contractAmazon = getMarketplaceNicheContract(nicheId, 'Amazon');
    const contractShopee = getMarketplaceNicheContract(nicheId, 'Shopee');
    const contractML = getMarketplaceNicheContract(nicheId, 'Mercado Livre');

    const termResults = [];
    const uniqueNicheValidProducts = new Map();

    const terms = [
      ...core.map((t) => ({ term: t, tier: 'core' })),
      ...expansion.map((t) => ({ term: t, tier: 'expansion' })),
    ];

    for (const { term, tier } of terms) {
      process.stdout.write(`  Termo [${tier.toUpperCase()}]: "${term}"... `);

      const termOutput = {
        nicheId,
        tier,
        term,
        marketplaces: {},
      };

      // 1. AMAZON (Max 5 candidatos para amostra)
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
          candidateLimit: 5,
          minDelayMs: 400,
        });

        const rawList = (amzRes?.products || []).slice(0, 5);
        const processed = [];
        let valid = 0;
        let accessoryCount = 0;
        let outOfNicheCount = 0;
        let invalidPriceCount = 0;
        const reasons = {};

        for (const p of rawList) {
          const classInfo = classifyProduct(p.title, p.price, contractAmazon, term);
          const isAccepted = classInfo.classification === 'RELEVANT';
          if (isAccepted) {
            valid += 1;
          } else {
            if (classInfo.classification === 'ACCESSORY_OR_PART') accessoryCount += 1;
            if (classInfo.classification === 'OUT_OF_NICHE') outOfNicheCount += 1;
            if (classInfo.classification === 'INVALID_PRICE') invalidPriceCount += 1;
            reasons[classInfo.reason] = (reasons[classInfo.reason] || 0) + 1;
          }

          const prod = {
            nicheId,
            tier,
            searchTerm: term,
            marketplace: 'Amazon',
            itemId: p.asin || 'unavailable',
            title: p.title || 'unavailable',
            price: p.price != null ? Number(p.price) : 'unavailable',
            rating: p.rating != null ? Number(p.rating) : 'unavailable',
            sales: 'unavailable',
            discount: p.discount != null ? Number(p.discount) : 'unavailable',
            category: contractAmazon?.amazonBrowseNodes?.[0] || 'unavailable',
            accepted: isAccepted,
            classification: classInfo.classification,
            rejectionReason: classInfo.reason,
          };
          processed.push(prod);
          if (isAccepted) {
            uniqueNicheValidProducts.set(`Amazon_${prod.itemId}`, prod);
            allSampleProducts.push(prod);
          }
        }

        const raw = processed.length;
        const rejected = raw - valid;
        termOutput.marketplaces.Amazon = {
          rawCount: raw,
          validCount: valid,
          rejectedCount: rejected,
          relevantCount: valid,
          accessoryNoiseCount: accessoryCount,
          outOfNicheCount,
          invalidPriceCount,
          relevanceRate: raw > 0 ? Number(((valid / raw) * 100).toFixed(1)) : 0,
          rejectionReasons: reasons,
          status: classifySampleStatus(valid, raw, rejected, null),
          products: processed,
        };
      } catch (err) {
        termOutput.marketplaces.Amazon = {
          rawCount: 0,
          validCount: 0,
          rejectedCount: 0,
          relevantCount: 0,
          accessoryNoiseCount: 0,
          outOfNicheCount: 0,
          invalidPriceCount: 0,
          relevanceRate: 0,
          rejectionReasons: {},
          status: 'ERROR',
          error: err.message,
          products: [],
        };
      }

      // 2. SHOPEE (Max 5 candidatos para amostra)
      if (shopeeRequest) {
        try {
          const shpRes = await shopeeRequest(
            'ShopeePromotionOffers',
            GRAPHQL_CONTRACTS.productOfferV2.query,
            {
              keyword: term,
              page: 1,
              limit: 5,
              sortType: 2,
              isAMSOffer: true,
            }
          );

          const rawNodes = (shpRes?.data?.data?.productOfferV2?.nodes || []).slice(0, 5);
          const processed = [];
          let valid = 0;
          let accessoryCount = 0;
          let outOfNicheCount = 0;
          let invalidPriceCount = 0;
          const reasons = {};

          for (const node of rawNodes) {
            const norm = normalizeProductOffer(node, { source: 'productOfferV2' });
            const p = norm.product;
            const classInfo = classifyProduct(p.productName, p.price, contractShopee, term);
            const isAccepted = classInfo.classification === 'RELEVANT';
            if (isAccepted) {
              valid += 1;
            } else {
              if (classInfo.classification === 'ACCESSORY_OR_PART') accessoryCount += 1;
              if (classInfo.classification === 'OUT_OF_NICHE') outOfNicheCount += 1;
              if (classInfo.classification === 'INVALID_PRICE') invalidPriceCount += 1;
              reasons[classInfo.reason] = (reasons[classInfo.reason] || 0) + 1;
            }

            const prod = {
              nicheId,
              tier,
              searchTerm: term,
              marketplace: 'Shopee',
              itemId: String(p.itemId || 'unavailable'),
              title: p.productName || 'unavailable',
              price: p.price != null ? Number(p.price) : 'unavailable',
              rating: p.ratingStar != null ? Number(p.ratingStar) : 'unavailable',
              sales: p.sales != null ? Number(p.sales) : 'unavailable',
              discount: p.priceDiscountRate != null ? Number(p.priceDiscountRate) : 'unavailable',
              category: p.productCatIds?.[0] || 'unavailable',
              accepted: isAccepted,
              classification: classInfo.classification,
              rejectionReason: classInfo.reason,
            };
            processed.push(prod);
            if (isAccepted) {
              uniqueNicheValidProducts.set(`Shopee_${prod.itemId}`, prod);
              allSampleProducts.push(prod);
            }
          }

          const raw = processed.length;
          const rejected = raw - valid;
          termOutput.marketplaces.Shopee = {
            rawCount: raw,
            validCount: valid,
            rejectedCount: rejected,
            relevantCount: valid,
            accessoryNoiseCount: accessoryCount,
            outOfNicheCount,
            invalidPriceCount,
            relevanceRate: raw > 0 ? Number(((valid / raw) * 100).toFixed(1)) : 0,
            rejectionReasons: reasons,
            status: classifySampleStatus(valid, raw, rejected, null),
            products: processed,
          };
        } catch (err) {
          termOutput.marketplaces.Shopee = {
            rawCount: 0,
            validCount: 0,
            rejectedCount: 0,
            relevantCount: 0,
            accessoryNoiseCount: 0,
            outOfNicheCount: 0,
            invalidPriceCount: 0,
            relevanceRate: 0,
            rejectionReasons: {},
            status: 'ERROR',
            error: err.message,
            products: [],
          };
        }
      } else {
        termOutput.marketplaces.Shopee = {
          rawCount: 0,
          validCount: 0,
          rejectedCount: 0,
          relevantCount: 0,
          accessoryNoiseCount: 0,
          outOfNicheCount: 0,
          invalidPriceCount: 0,
          relevanceRate: 0,
          rejectionReasons: {},
          status: 'ERROR',
          error: 'Credenciais Shopee indisponíveis',
          products: [],
        };
      }

      // 3. MERCADO LIVRE (Harness corrigido para ler p.product_name || p.name || p.title)
      if (mlAccessToken) {
        try {
          const mlRes = await runMercadoLivreOfficialIntentCoverage({
            accessToken: mlAccessToken,
            keywords: [term],
            maxPerIntent: 5,
            delayMs: 200,
          });

          const rawList = (mlRes?.products || []).slice(0, 5);
          const processed = [];
          let valid = 0;
          let accessoryCount = 0;
          let outOfNicheCount = 0;
          let invalidPriceCount = 0;
          const reasons = {};

          for (const p of rawList) {
            const title = p.product_name || p.name || p.title || null;
            const price = p.current_price != null ? Number(p.current_price) : (p.price != null ? Number(p.price) : null);
            const classInfo = classifyProduct(title, price, contractML, term);
            const isAccepted = classInfo.classification === 'RELEVANT';
            if (isAccepted) {
              valid += 1;
            } else {
              if (classInfo.classification === 'ACCESSORY_OR_PART') accessoryCount += 1;
              if (classInfo.classification === 'OUT_OF_NICHE') outOfNicheCount += 1;
              if (classInfo.classification === 'INVALID_PRICE') invalidPriceCount += 1;
              reasons[classInfo.reason] = (reasons[classInfo.reason] || 0) + 1;
            }

            const prod = {
              nicheId,
              tier,
              searchTerm: term,
              marketplace: 'Mercado Livre',
              itemId: String(p.product_id || p.item_id || p.id || 'unavailable'),
              title: title || 'unavailable',
              price: price != null ? price : 'unavailable',
              rating: 'unavailable',
              sales: p.sold_quantity != null ? Number(p.sold_quantity) : 'unavailable',
              discount: p.old_price && price ? Number((((p.old_price - price) / p.old_price) * 100).toFixed(1)) : 'unavailable',
              category: p.domain_id || p.category_id || 'unavailable',
              accepted: isAccepted,
              classification: classInfo.classification,
              rejectionReason: classInfo.reason,
            };
            processed.push(prod);
            if (isAccepted) {
              uniqueNicheValidProducts.set(`ML_${prod.itemId}`, prod);
              allSampleProducts.push(prod);
            }
          }

          const raw = processed.length;
          const rejected = raw - valid;
          const status = classifySampleStatus(valid, raw, rejected, null);

          termOutput.marketplaces['Mercado Livre'] = {
            rawCount: raw,
            validCount: valid,
            rejectedCount: rejected,
            relevantCount: valid,
            accessoryNoiseCount: accessoryCount,
            outOfNicheCount,
            invalidPriceCount,
            relevanceRate: raw > 0 ? Number(((valid / raw) * 100).toFixed(1)) : 0,
            rejectionReasons: reasons,
            status,
            products: processed,
          };
        } catch (err) {
          termOutput.marketplaces['Mercado Livre'] = {
            rawCount: 0,
            validCount: 0,
            rejectedCount: 0,
            relevantCount: 0,
            accessoryNoiseCount: 0,
            outOfNicheCount: 0,
            invalidPriceCount: 0,
            relevanceRate: 0,
            rejectionReasons: {},
            status: 'ERROR',
            error: err.message,
            products: [],
          };
        }
      } else {
        termOutput.marketplaces['Mercado Livre'] = {
          rawCount: 0,
          validCount: 0,
          rejectedCount: 0,
          relevantCount: 0,
          accessoryNoiseCount: 0,
          outOfNicheCount: 0,
          invalidPriceCount: 0,
          relevanceRate: 0,
          rejectionReasons: {},
          status: 'ERROR',
          error: 'Token ML indisponível',
          products: [],
        };
      }

      const amzV = termOutput.marketplaces.Amazon?.validCount || 0;
      const shpV = termOutput.marketplaces.Shopee?.validCount || 0;
      const mlV = termOutput.marketplaces['Mercado Livre']?.validCount || 0;
      const totalV = amzV + shpV + mlV;

      let consolidatedTermStatus = 'EMPTY';
      if (totalV >= 3) consolidatedTermStatus = 'GOOD';
      else if (totalV >= 1) consolidatedTermStatus = 'LIMITED';

      termOutput.consolidated = {
        validTotal: totalV,
        status: consolidatedTermStatus,
      };

      termResults.push(termOutput);
      console.log(`OK (Válidos: Amz=${amzV} [${termOutput.marketplaces.Amazon.status}], Shp=${shpV} [${termOutput.marketplaces.Shopee.status}], ML=${mlV} [${termOutput.marketplaces['Mercado Livre'].status}] | Consolidado=${consolidatedTermStatus})`);
    }

    const countStatus = (mkt, st) => termResults.filter((t) => t.marketplaces[mkt]?.status === st).length;

    nicheReports.push({
      nicheId,
      nicheName: niche.name,
      testedTerms: terms.map((t) => t.term),
      amazon: {
        good: countStatus('Amazon', 'GOOD'),
        limited: countStatus('Amazon', 'LIMITED'),
        empty: countStatus('Amazon', 'EMPTY'),
        noisy: countStatus('Amazon', 'NOISY'),
      },
      shopee: {
        good: countStatus('Shopee', 'GOOD'),
        limited: countStatus('Shopee', 'LIMITED'),
        empty: countStatus('Shopee', 'EMPTY'),
        noisy: countStatus('Shopee', 'NOISY'),
      },
      mercadoLivre: {
        good: countStatus('Mercado Livre', 'GOOD'),
        limited: countStatus('Mercado Livre', 'LIMITED'),
        empty: countStatus('Mercado Livre', 'EMPTY'),
        noisy: countStatus('Mercado Livre', 'NOISY'),
      },
      uniqueValidProducts: uniqueNicheValidProducts.size,
      terms: termResults,
    });
  }

  // Gravação do relatório JSON
  const reportsDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const jsonReportPath = path.join(reportsDir, 'commercial-niche-sample-validation.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'sample_product_validation_v2_calibrated',
    totalNiches: SAMPLE_MATRIX.length,
    totalTerms: SAMPLE_MATRIX.length * 3,
    writes: { supabase: 0, offers: 0, posts: 0, publications: 0 },
    niches: nicheReports,
  }, null, 2));

  console.log(`\n[AMOSTRAGEM CONCLUÍDA] Relatório salvo em: ${jsonReportPath}`);
}

main().catch((err) => {
  console.error(`[ERRO FATAL NA AMOSTRAGEM] ${err.message}`);
  process.exitCode = 1;
});
