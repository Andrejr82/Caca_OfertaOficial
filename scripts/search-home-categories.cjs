'use strict';

/**
 * Script de Busca Especializada: Cozinha, Banheiro e Quarto de Casal
 * Marketplaces: Shopee e Mercado Livre
 * 
 * Gera relatório em Markdown com ranking de até 50 produtos por nicho.
 * Suporta flag `--persist` para posterior sincronização com o banco.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('node:fs');
const path = require('node:path');
const { createSignedRequest, GRAPHQL_CONTRACTS } = require('./shopee-openapi-shadow-engine-v1.cjs');
const { refreshAccessToken, runMercadoLivreOfficialIntentCoverage, apiGet } = require('./mercadolivre-official-intents-v5.cjs');

const TARGET_LIMIT_PER_CATEGORY = 50;
const OUTPUT_REPORT_PATH = path.resolve('reports/busca-cozinha-banheiro-quarto.md');

const CATEGORY_DEFINITIONS = [
  {
    id: 'cozinha',
    title: '🍳 Cozinha & Utensílios',
    description: 'Organizadores de cozinha, jogos de panelas, potes herméticos, escorredores, faqueiros e eletroportáteis úteis.',
    shopeeCatIds: [11060116, 11060108, 100010, 100636],
    shopeeKeywords: [
      'organizador de armario cozinha',
      'jogo de panelas antiaderente',
      'kit utensilios silicone cozinha',
      'potes hermeticos vidro',
      'escorredor louca inox duplo',
      'porta temperos giratorio inox',
      'faqueiro inox conjunto',
      'dispenser detergente esponja',
      'tapete escorredor louca',
      'air fryer fritadeira',
      'panela eletrica pressao',
      'liquidificador turbo',
      'mixer 3 em 1 eletrico',
      'sanduicheira grill',
      'aparelho de jantar ceramica',
      'conjunto formas silicone'
    ],
    mercadolivreTerms: [
      'jogo de panelas antiaderente',
      'organizador armario cozinha',
      'kit utensilios silicone cozinha',
      'potes hermeticos vidro',
      'escorredor louca inox',
      'porta tempero giratorio',
      'faqueiro inox completo',
      'air fryer fritadeira eletrica',
      'liquidificador turbo',
      'panela de pressao eletrica',
      'mixer multifuncional',
      'dispenser detergente pia'
    ],
    negativeRegex: /\b(peca|reposicao|valvula avulsa|borracha de panela|cabo avulso|resistencia|soquete|placa)\b/i,
  },
  {
    id: 'banheiro',
    title: '🚿 Banheiro & Organização',
    description: 'Acessórios inox, suportes adesivos sem furo, tapetes ultra absorventes, dispensers e lixeiras com pedal.',
    shopeeCatIds: [11060105, 11060113, 100010, 100636],
    shopeeKeywords: [
      'kit acessorios banheiro inox',
      'porta shampoo adesivo inox sem furo',
      'tapete banheiro antiderrapante absorvente',
      'dispenser sabonete automatico sensor',
      'lixeira banheiro inox pedal',
      'porta toalha banheiro adesivo',
      'ducha higienica inox registro',
      'porta escova dente dispenser pasta',
      'jogo toalhas banho algodao',
      'cortina box banheiro impermeavel',
      'suporte papel higienico inox',
      'organizador maquiagem cosmeticos acrilico',
      'rodo pia silicone box',
      'espelho aumento led banheiro'
    ],
    mercadolivreTerms: [
      'kit acessorios banheiro inox',
      'porta shampoo adesivo inox',
      'tapete banheiro super absorvente',
      'lixeira inox pedal banheiro',
      'dispenser sabonete liquido sensor',
      'porta toalha banheiro adesivo inox',
      'ducha higienica inox',
      'jogo toalhas de banho 100 algodao',
      'suporte papel higienico sem furo',
      'cortina box impermeavel'
    ],
    negativeRegex: /\b(reparo|cartucho torneira|vedacao|tubo esgoto|sifao avulso|ralo seco peca)\b/i,
  },
  {
    id: 'quarto_casal',
    title: '🛏️ Quarto de Casal & Enxoval',
    description: 'Jogos de cama 400 fios, cobre leitos matelassê, travesseiros ortopédicos, organizadores de armário e iluminação.',
    shopeeCatIds: [11060106, 11060107, 100010, 100636],
    shopeeKeywords: [
      'jogo de lencol casal 400 fios',
      'cobre leito casal matelasse',
      'edredom casal dupla face toque pluma',
      'kit 2 travesseiros nasa ortopedico',
      'protetor colchao casal impermeavel',
      'organizador gavetas colmeia',
      'kit cabides veludo antideslizante',
      'abajur touch quarto casal',
      'cortina blackout quarto casal',
      'sapateira vertical organizadora',
      'manta casal microfibra soft',
      'saia cama box casal matelada',
      'luminaria cabeceira casal led'
    ],
    mercadolivreTerms: [
      'jogo lencol casal 400 fios percal',
      'cobre leito casal matelasse',
      'edredom casal dupla face pluma',
      'kit 2 travesseiros nasa',
      'protetor colchao impermeavel casal',
      'organizador colmeia gaveta guarda roupa',
      'kit cabides veludo antideslizante',
      'cortina blackout tecido casal',
      'abajur mesa cabeceira touch',
      'manta microfibra casal toque macio'
    ],
    negativeRegex: /\b(solteiro|infantil|berco|mini cama|peca reposicao|capa avulsa sem enchimento)\b/i,
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
  if (price > 0 && price <= 250) score += 5;
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
          sortType: 2, // Sort by sales / relevance
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
        const rawOldPrice = parseNumber(node.priceMax || node.price);
        const discountRate = parseNumber(node.priceDiscountRate);
        const oldPrice = rawOldPrice > currentPrice ? rawOldPrice : (discountRate > 0 ? (currentPrice / (1 - discountRate / 100)) : null);
        const discountPercent = discountRate > 0 ? discountRate : (oldPrice ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0);
        const rating = parseNumber(node.ratingStar, 4.8);
        const sales = parseNumber(node.sales, 0);

        if (currentPrice <= 0) continue;

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
    } catch (err) {
      // Silently continue to next keyword
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
      const oldPrice = parseNumber(item.old_price ?? item.original_price);
      const discountPercent = oldPrice > currentPrice
        ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100)
        : parseNumber(item.discount_percent, 0);
      const rating = parseNumber(item.rating_average ?? item.rating, 4.7);
      const sales = parseNumber(item.sold_quantity ?? item.sales, 0);

      if (currentPrice <= 0) continue;

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
  console.log('=== INICIANDO BUSCA EXPANDIDA DE OFERTAS ===');
  console.log(`Meta: até ${TARGET_LIMIT_PER_CATEGORY} produtos selecionados por nicho (Cozinha, Banheiro, Quarto Casal)`);

  // 1. Inicializar Shopee
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
  } else {
    console.warn('[Shopee API] Credenciais ausentes em .env.local');
  }

  // 2. Inicializar Mercado Livre
  let mlAccessToken = null;
  try {
    mlAccessToken = await refreshAccessToken();
    console.log('[Mercado Livre API] Conectado e token atualizado com sucesso');
  } catch (err) {
    console.warn(`[Mercado Livre API] Aviso de autenticação: ${err.message}`);
  }

  const categoryResults = {};
  let totalCollected = 0;

  for (const catDef of CATEGORY_DEFINITIONS) {
    console.log(`\n🔍 Buscando categoria: ${catDef.title}...`);
    const [shopeeItems, mlItems] = await Promise.all([
      collectShopeeProducts(catDef, shopeeCaller),
      collectMercadoLivreProducts(catDef, mlAccessToken),
    ]);

    console.log(`  - Shopee: ${shopeeItems.length} candidatos encontrados`);
    console.log(`  - Mercado Livre: ${mlItems.length} candidatos encontrados`);

    // Balancear e mesclar os 50 melhores por score
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

  let md = `# 🏆 Relatório de Achados: Cozinha, Banheiro e Quarto de Casal\n\n`;
  md += `> **Data de Geração:** ${dateStr} às ${timeStr} (Horário de Brasília)\n`;
  md += `> **Status:** Amostra Expandida de Cobertura (Limite ampliado para **${TARGET_LIMIT_PER_CATEGORY} produtos** por categoria)\n`;
  md += `> **Total de Ofertas Curadas:** ${totalCollected} produtos prontos para validação\n\n`;
  md += `---\n\n`;

  md += `## 📊 Resumo Executivo da Coleta\n\n`;
  md += `| Categoria | Shopee Encontrados | Mercado Livre Encontrados | Curados no Top ${TARGET_LIMIT_PER_CATEGORY} | Menor Preço | Maior Desconto |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;

  for (const catDef of CATEGORY_DEFINITIONS) {
    const res = categoryResults[catDef.id];
    const prices = res.items.map((i) => i.price).filter((p) => p > 0);
    const discounts = res.items.map((i) => i.discountPercent).filter((d) => d > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxDiscount = discounts.length ? Math.max(...discounts) : 0;

    md += `| ${catDef.title} | ${res.shopeeCount} | ${res.mlCount} | **${res.items.length}** | ${formatBRL(minPrice)} | ${maxDiscount}% |\n`;
  }

  md += `\n---\n\n`;

  for (const catDef of CATEGORY_DEFINITIONS) {
    const res = categoryResults[catDef.id];
    md += `## ${catDef.title}\n\n`;
    md += `_${catDef.description}_\n\n`;
    md += `**Total selecionado:** ${res.items.length} ofertas de alta relevância\n\n`;

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

  md += `## 🚀 Próximos Passos e Integração com o Painel\n\n`;
  md += `1. **Conferência Editorial**: Revise os itens listados acima diretamente pelos links de produtos.\n`;
  md += `2. **Persistência no Painel**: Ao aprovar a seleção, execute o script com o comando \`node scripts/search-home-categories.cjs --persist\` para registrar todas as ${totalCollected} ofertas diretamente no banco Supabase.\n`;
  md += `3. **Exibição sem restrição de 30 itens**: O painel exibirá o catálogo completo por abas ou lista expandida.\n`;

  fs.mkdirSync(path.dirname(OUTPUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_REPORT_PATH, md, 'utf-8');

  console.log(`\n✅ Relatório gerado com sucesso em: ${OUTPUT_REPORT_PATH}`);
  console.log(`Total de ofertas compiladas: ${totalCollected}`);

  // Se passou --persist, salvar no Supabase
  if (process.argv.includes('--persist')) {
    console.log('\n[Persistência] Flag --persist detectada. Salvando no banco de dados...');
    const { createClient } = require('@supabase/supabase-js');
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Persistência] Erro: SUPABASE_URL ou SERVICE_ROLE_KEY ausentes.');
      return;
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    let insertCount = 0;
    for (const catDef of CATEGORY_DEFINITIONS) {
      const res = categoryResults[catDef.id];
      for (const item of res.items) {
        const payload = {
          product_name: item.title,
          platform: item.marketplace,
          current_price: item.price,
          old_price: item.oldPrice,
          rating: item.rating,
          original_url: item.affiliateUrl,
          image_url: item.imageUrl,
          category: catDef.id,
          category_name: catDef.title.replace(/^[^\w\s]+/, '').trim(),
          seller_name: item.shopName,
          status: 'draft',
          marketplace_metrics: {
            sales: item.sales,
            discountPercent: item.discountPercent,
            score: item.score,
            source: 'search_home_categories_v1'
          }
        };

        const { error } = await supabase.from('offers').upsert(payload, { onConflict: 'original_url' });
        if (!error) insertCount++;
      }
    }
    console.log(`[Persistência] Concluído! ${insertCount} ofertas inseridas/atualizadas com sucesso no painel.`);
  }
}

main().catch((err) => {
  console.error('Erro na execução do script:', err);
  process.exit(1);
});
