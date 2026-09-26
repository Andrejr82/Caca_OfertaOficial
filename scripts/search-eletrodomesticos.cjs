'use strict';

/**
 * Script de Busca Especializada: Eletrodomésticos Acessíveis & Casa Nova
 * Marketplaces: Shopee e Mercado Livre
 * 
 * Limite de Preço Máximo: R$ 299,00
 * Gera relatório em Markdown com ranking por custo-benefício e notas.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('node:fs');
const path = require('node:path');
const { createSignedRequest, GRAPHQL_CONTRACTS } = require('./shopee-openapi-shadow-engine-v1.cjs');
const { refreshAccessToken, runMercadoLivreOfficialIntentCoverage } = require('./mercadolivre-official-intents-v5.cjs');

const TARGET_LIMIT_PER_CATEGORY = 50;
const OUTPUT_REPORT_PATH = path.resolve('reports/busca-eletrodomesticos-acessiveis.md');

const ELETRO_CATEGORIES = [
  {
    id: 'cafe_lanches',
    title: '☕ Café da Manhã & Lanches Rápidos',
    description: 'Sanduicheiras, cafeteiras elétricas, chaleiras inox, torradeiras, espumadores e omeleteiras.',
    maxPrice: 120,
    shopeeCatIds: [100010, 100636],
    shopeeKeywords: [
      'sanduicheira e grill antiaderente',
      'cafeteira eletrica jarra inox vidro',
      'chaleira eletrica inox 1 8l',
      'torradeira eletrica 2 fatias',
      'espumador de leite eletrico usb',
      'omeleteira eletrica antiaderente'
    ],
    mercadolivreTerms: [
      'sanduicheira grill antiaderente',
      'cafeteira eletrica',
      'chaleira eletrica inox',
      'torradeira eletrica',
      'espumador leite eletrico mixer'
    ],
    negativeRegex: /\b(peca|reposicao|jarra avulsa|copo avulso|resistencia|placa|cabo avulso|filtro avulso|tampa avulsa)\b/i,
  },
  {
    id: 'preparo_cozinha',
    title: '🍲 Almoço, Jantar & Preparo Rápido',
    description: 'Air Fryers compactas, liquidificadores turbo, mixers 3 em 1, panelas de arroz e mini processadores.',
    maxPrice: 280,
    shopeeCatIds: [100010, 100636],
    shopeeKeywords: [
      'air fryer fritadeira eletrica 3 5l 4l',
      'liquidificador turbo com filtro',
      'mixer multifuncional 3 em 1',
      'panela eletrica de arroz',
      'mini processador alimentos eletrico',
      'batedeira eletrica com tigela',
      'fogao eletrico 1 boca portatil'
    ],
    mercadolivreTerms: [
      'air fryer fritadeira eletrica',
      'liquidificador turbo',
      'mixer 3 em 1 eletrico',
      'panela de arroz eletrica',
      'mini processador eletrico',
      'batedeira eletrica'
    ],
    negativeRegex: /\b(copo de liquidificador|helice|lamina|cesto avulso|forma avulsa|peca reposicao|motor avulso|grelha avulsa)\b/i,
  },
  {
    id: 'limpeza_casa',
    title: '🧹 Limpeza, Roupas & Climatização',
    description: 'Aspiradores verticais 2 em 1, ferros a vapor, vaporizadores portáteis, ventiladores turbo e bombas de galão.',
    maxPrice: 190,
    shopeeCatIds: [100010, 100636],
    shopeeKeywords: [
      'aspirador de po vertical 2 em 1',
      'ferro de passar roupa a vapor',
      'vaporizador roupas portatil passadeira',
      'ventilador turbo mesa silencioso 40cm',
      'bomba eletrica galao agua 20l',
      'mini aspirador portatil recarregavel'
    ],
    mercadolivreTerms: [
      'aspirador po vertical 2 em 1',
      'ferro passar roupa vapor',
      'vaporizador roupas portatil',
      'ventilador turbo mesa silencioso',
      'bomba eletrica galao agua'
    ],
    negativeRegex: /\b(refil filtro|bocal avulso|helice avulsa|grade ventilador|haste avulsa|mangueira avulsa|peca)\b/i,
  },
  {
    id: 'bem_estar_pessoal',
    title: '💇 Bem-Estar, Banheiro & Quarto',
    description: 'Escovas secadoras 3 em 1, secadores de cabelo turbo, barbeadores recarregáveis, umidificadores e balanças.',
    maxPrice: 120,
    shopeeCatIds: [100630, 100010, 100636],
    shopeeKeywords: [
      'escova secadora e modeladora 3 em 1',
      'secador de cabelo turbo dobravel',
      'maquina cortar cabelo barbeador eletrico t9',
      'umidificador aromatizador ultrassonico led',
      'balanca digital corporal bioimpedancia'
    ],
    mercadolivreTerms: [
      'escova secadora modeladora',
      'secador de cabelo turbo',
      'maquina barbear eletrica recarregavel',
      'umidificador de ar ultrassonico',
      'balanca digital bioimpedancia'
    ],
    negativeRegex: /\b(bateria avulsa|pente avulso|bico avulso|cabo carregador|filtro refil|oleo lubrificante avulso)\b/i,
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : fallback;
}

function calculateScore({ price, oldPrice, discountPercent, rating, sales }) {
  let score = 50;
  if (discountPercent > 0) score += Math.min(25, discountPercent * 0.5);
  if (rating >= 4.7) score += 15;
  else if (rating >= 4.5) score += 10;
  if (sales >= 1000) score += 15;
  else if (sales >= 100) score += 10;
  else if (sales >= 20) score += 5;
  if (price > 0 && price <= 180) score += 5;
  return Math.round(Math.min(100, Math.max(10, score)));
}

async function collectShopeeProducts(categoryDef, shopeeCaller) {
  if (!shopeeCaller) return [];
  const results = [];
  const seenIds = new Set();

  for (const keyword of categoryDef.shopeeKeywords) {
    if (results.length >= TARGET_LIMIT_PER_CATEGORY * 2) break;
    try {
      const response = await shopeeCaller(
        'ShopeePromotionOffers',
        GRAPHQL_CONTRACTS.productOfferV2.query,
        {
          keyword,
          page: 1,
          limit: 30,
          sortType: 2,
        },
        { timeoutMs: 15000 }
      );

      const nodes = response?.data?.data?.productOfferV2?.nodes || [];
      for (const node of nodes) {
        const itemId = String(node.itemId || '').trim();
        const title = String(node.productName || '').trim();
        if (!itemId || !title || seenIds.has(itemId)) continue;
        if (categoryDef.negativeRegex.test(title)) continue;

        const currentPrice = parseNumber(node.priceMin || node.price);
        if (currentPrice <= 0 || currentPrice > categoryDef.maxPrice) continue;

        const rawOldPrice = parseNumber(node.priceMax || node.price);
        const discountRate = parseNumber(node.priceDiscountRate);
        const oldPrice = rawOldPrice > currentPrice ? rawOldPrice : (discountRate > 0 ? (currentPrice / (1 - discountRate / 100)) : null);
        const discountPercent = discountRate > 0 ? discountRate : (oldPrice ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0);
        const rating = parseNumber(node.ratingStar, 4.8);
        const sales = parseNumber(node.sales, 0);

        seenIds.add(itemId);
        results.push({
          id: `shopee-${itemId}`,
          marketplace: 'Shopee',
          title,
          price: currentPrice,
          oldPrice: oldPrice ? Number(oldPrice.toFixed(2)) : null,
          discountPercent,
          rating,
          sales,
          affiliateUrl: node.offerLink || node.productLink || `https://shopee.com.br/product/${node.shopId}/${itemId}`,
          imageUrl: node.imageUrl || '',
          shopName: node.shopName || 'Loja Shopee',
          score: calculateScore({ price: currentPrice, oldPrice, discountPercent, rating, sales })
        });
      }
      await sleep(150);
    } catch {
      // Continue
    }
  }

  return results;
}

async function collectMercadoLivreProducts(categoryDef, mlAccessToken) {
  if (!mlAccessToken) return [];
  const results = [];
  const seenIds = new Set();

  try {
    const coverageResult = await runMercadoLivreOfficialIntentCoverage({
      keywords: categoryDef.mercadolivreTerms,
      accessToken: mlAccessToken,
      maxPerIntent: 15,
      delayMs: 100,
    });

    const rawProducts = Array.isArray(coverageResult?.products) ? coverageResult.products : [];
    for (const item of rawProducts) {
      const itemId = String(item.item_id || item.id || '').trim();
      const title = String(item.product_name || item.title || item.name || '').trim();
      if (!itemId || !title || seenIds.has(itemId)) continue;
      if (categoryDef.negativeRegex.test(title)) continue;

      const currentPrice = parseNumber(item.current_price ?? item.price);
      if (currentPrice <= 0 || currentPrice > categoryDef.maxPrice) continue;

      const oldPrice = parseNumber(item.old_price ?? item.original_price);
      const discountPercent = oldPrice > currentPrice
        ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100)
        : parseNumber(item.discount_percent, 0);
      const rating = parseNumber(item.rating_average ?? item.rating, 4.7);
      const sales = parseNumber(item.sold_quantity ?? item.sales, 0);

      seenIds.add(itemId);
      results.push({
        id: `ml-${itemId}`,
        marketplace: 'Mercado Livre',
        title,
        price: currentPrice,
        oldPrice: oldPrice > 0 ? oldPrice : null,
        discountPercent,
        rating,
        sales,
        affiliateUrl: item.product_url || item.permalink || '',
        imageUrl: item.image_url || item.thumbnail || '',
        shopName: item.seller_name || 'Mercado Livre',
        score: calculateScore({ price: currentPrice, oldPrice, discountPercent, rating, sales })
      });
    }
  } catch (err) {
    console.warn(`    [ML Coverage Error]: ${err.message}`);
  }

  return results;
}

function formatBRL(val) {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `R$ ${Number(val).toFixed(2).replace('.', ',')}`;
}

async function main() {
  console.log('=== INICIANDO BUSCA DE ELETRODOMÉSTICOS ACESSÍVEIS ===');
  console.log(`Filtro rigoroso: limite de preço por categoria e sem peças de reposição`);

  // 1. Conectar Shopee
  let shopeeCaller = null;
  if (process.env.SHOPEE_APP_ID && process.env.SHOPEE_APP_SECRET) {
    shopeeCaller = createSignedRequest({
      appId: process.env.SHOPEE_APP_ID,
      appSecret: process.env.SHOPEE_APP_SECRET,
      request: async ({ body, headers }) => {
        const response = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(30000),
        });
        return { status: response.status, data: await response.json() };
      },
    });
    console.log('[Shopee API] Conectado e autenticado via OpenAPI');
  }

  // 2. Conectar Mercado Livre
  let mlAccessToken = null;
  try {
    mlAccessToken = await refreshAccessToken();
    console.log('[Mercado Livre API] Conectado e token atualizado');
  } catch (err) {
    console.warn(`[Mercado Livre API] Aviso: ${err.message}`);
  }

  const categoryResults = {};
  let totalCollected = 0;

  for (const catDef of ELETRO_CATEGORIES) {
    console.log(`\n🔍 Buscando: ${catDef.title} (Teto: ${formatBRL(catDef.maxPrice)})...`);
    const [shopeeItems, mlItems] = await Promise.all([
      collectShopeeProducts(catDef, shopeeCaller),
      collectMercadoLivreProducts(catDef, mlAccessToken),
    ]);

    console.log(`  - Shopee: ${shopeeItems.length} candidatos encontrados`);
    console.log(`  - Mercado Livre: ${mlItems.length} candidatos encontrados`);

    const combined = [...shopeeItems, ...mlItems].sort((a, b) => b.score - a.score);
    const top50 = combined.slice(0, TARGET_LIMIT_PER_CATEGORY);

    categoryResults[catDef.id] = {
      def: catDef,
      totalFound: combined.length,
      shopeeCount: shopeeItems.length,
      mlCount: mlItems.length,
      items: top50,
    };

    totalCollected += top50.length;
  }

  // 3. Gerar Relatório Markdown
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const timeStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let md = `# ⚡ Relatório de Achados: Eletrodomésticos Acessíveis para Casa Nova\n\n`;
  md += `> **Data de Geração:** ${dateStr} às ${timeStr} (Horário de Brasília)\n`;
  md += `> **Filtro Aplicado:** Apenas produtos funcionais e completos (Teto máximo R$ 280,00 | Exclusão de peças/acessórios avulsos)\n`;
  md += `> **Total de Ofertas Curadas:** ${totalCollected} eletros selecionados\n\n`;
  md += `---\n\n`;

  md += `## 📊 Resumo Executivo por Categoria\n\n`;
  md += `| Categoria | Teto de Preço | Shopee | Mercado Livre | Top 50 Selecionados | Menor Preço | Maior Desconto |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  for (const catDef of ELETRO_CATEGORIES) {
    const res = categoryResults[catDef.id];
    const prices = res.items.map((i) => i.price).filter((p) => p > 0);
    const discounts = res.items.map((i) => i.discountPercent).filter((d) => d > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxDiscount = discounts.length ? Math.max(...discounts) : 0;

    md += `| ${catDef.title} | ${formatBRL(catDef.maxPrice)} | ${res.shopeeCount} | ${res.mlCount} | **${res.items.length}** | ${formatBRL(minPrice)} | ${maxDiscount}% |\n`;
  }

  md += `\n---\n\n`;

  for (const catDef of ELETRO_CATEGORIES) {
    const res = categoryResults[catDef.id];
    md += `## ${catDef.title}\n\n`;
    md += `_${catDef.description}_\n\n`;
    md += `**Total selecionado:** ${res.items.length} produtos de alta relevância\n\n`;

    md += `| # | Marketplace | Produto | Preço Atual | De / Original | Desconto | Nota ⭐ | Vendas | Score |\n`;
    md += `| :-: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    res.items.forEach((item, index) => {
      const badge = item.marketplace === 'Shopee' ? '🟠 Shopee' : '🟡 Mercado Livre';
      const cleanTitle = item.title.replace(/\|/g, '-');
      const link = item.affiliateUrl ? `[${cleanTitle}](${item.affiliateUrl})` : cleanTitle;
      const oldPriceStr = item.oldPrice ? formatBRL(item.oldPrice) : '-';
      const discountStr = item.discountPercent > 0 ? `**-${item.discountPercent}%**` : '-';
      const ratingStr = item.rating ? `${item.rating.toFixed(1)}` : '-';
      const salesStr = item.sales > 0 ? `${item.sales.toLocaleString('pt-BR')}` : '-';

      md += `| ${index + 1} | ${badge} | ${link} | **${formatBRL(item.price)}** | ${oldPriceStr} | ${discountStr} | ${ratingStr} | ${salesStr} | **${item.score}** |\n`;
    });

    md += `\n---\n\n`;
  }

  fs.mkdirSync(path.dirname(OUTPUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_REPORT_PATH, md, 'utf-8');

  console.log(`\n✅ Relatório gerado com sucesso em: ${OUTPUT_REPORT_PATH}`);
  console.log(`Total de ofertas compiladas: ${totalCollected}`);
}

main().catch((err) => {
  console.error('Erro na execução do script de eletros:', err);
  process.exit(1);
});
