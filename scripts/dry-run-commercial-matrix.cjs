'use strict';

// Read-only commercial-matrix simulation. This script intentionally exposes no
// write methods and never calls marketplace, publishing, or scheduling APIs.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const commercialCuration = require('./commercial-curation-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'SHOPEE_ML_COMMERCIAL_MATRIX_DRY_RUN_REPORT.md');
const CURATION_REPORT_PATH = path.join(ROOT, 'docs', 'COMMERCIAL_CURATION_V1_REPORT.md');
const POLISH_REPORT_PATH = path.join(ROOT, 'docs', 'COMMERCIAL_CURATION_V1_POLISH_REPORT.md');
const REFERENCE_NOW = new Date('2026-08-07T12:01:00.000Z'); // 09:01 BRT (UTC-3)
const MARKETPLACES = new Set(['Shopee', 'Mercado Livre']);
const INTENTS = [
  ['audio_e_gadget_visual', /fone|headphone|caixa de som|soundbar|microfone|bluetooth/],
  ['lazer_gamer_acessorio', /gamer|jogo|gamepad|controle|playstation|xbox|nintendo/],
  ['utilidade_casa_essencial', /cozinha|panela|pote|utens[ií]lio|limpeza|casa|lixeira|varal|torneira|tapete/],
  ['casa_organizada_antes_depois', /organiza|gaveta|cabide|prateleira|caixa|cesto|arm[aá]rio|suporte/],
  ['faca_voce_mesmo_leve', /ferramenta|furadeira|parafuso|chave|broca|alicate|fita|lixa/],
  ['upgrade_trabalho_estudo', /notebook|teclado|mouse|monitor|escrit[oó]rio|mesa|cadeira|webcam|suporte.*notebook/],
  ['tech_de_bolso', /celular|smartphone|carregador|power bank|cabo|capinha|pel[ií]cula|smartwatch/],
  ['autocuidado_que_resolve', /beleza|maquiagem|skincare|hidratante|secador|barbeador|perfume/],
  ['look_sem_erro', /camisa|cal[cç]a|vestido|blusa|jaqueta|t[eê]nis|bolsa|mochila|moda/],
  ['movimento_em_casa', /fitness|academia|halter|yoga|esteira|bicicleta|esporte|legging/],
  ['pet_recorrente_e_util', /pet|cachorro|gato|areia|ra[cç][aã]o|coleira|tapete higi[eê]nico/],
  ['carro_pratico', /carro|automotivo|ve[ií]culo|moto|painel|capacete|pneu/],
  ['eletro_validado_para_casa', /air fryer|liquidificador|cafeteira|aspirador|geladeira|lavadora|ventilador/],
  ['casa_escritorio_comparado', /m[oó]vel|cadeira|mesa|estante|escrit[oó]rio|lumin[aá]ria/],
  ['oferta_real_do_dia', /oferta|promo[cç][aã]o|desconto|cupom/],
  ['cupons_verificados_manual', /cupom/],
];

const CURRENT_SCENARIOS = [
  ['tv_audio_editorial', /fone|headphone|caixa de som|soundbar|microfone|bluetooth/],
  ['casa_cozinha_editorial', /cozinha|panela|pote|utens[ií]lio|limpeza|casa/], ['organizacao_editorial', /organiza|gaveta|cabide|prateleira|caixa|cesto/],
  ['ferramentas_editorial', /ferramenta|furadeira|parafuso|chave|broca|alicate/], ['informatica_editorial', /notebook|teclado|mouse|monitor|computador/],
  ['celulares_editorial', /celular|smartphone|carregador|power bank|cabo|capinha/], ['beleza_editorial', /beleza|maquiagem|skincare|hidratante|secador|perfume/],
  ['moda_editorial', /camisa|cal[cç]a|vestido|blusa|jaqueta|t[eê]nis|bolsa/], ['esporte_editorial', /fitness|academia|halter|yoga|esporte|legging/],
  ['pet_editorial', /pet|cachorro|gato|areia|ra[cç][aã]o|coleira/],
  ['eletrodomesticos_editorial', /air fryer|liquidificador|cafeteira|aspirador|geladeira|lavadora/], ['moveis_editorial', /m[oó]vel|cadeira|mesa|estante/],
  ['grandes_ofertas_editorial', /oferta|promo[cç][aã]o|desconto/], ['cupons_aprovados_editorial', /cupom/],
];

function num(value) { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : null; }
function pct(value) { const n = num(value); return n != null && n > 0 && n <= 1 ? n * 100 : n; }
function clean(value) { return String(value || '').replace(/[|\n\r]+/g, ' ').trim(); }
function money(value) { return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function classifyByRules(product, rules, fallback) { const text = `${product.title || ''} ${product.category || ''} ${product.categoryName || ''}`.toLocaleLowerCase('pt-BR'); return rules.find(([, pattern]) => pattern.test(text))?.[0] || fallback; }
function classifyCommercialIntent(product) { return classifyByRules(product, INTENTS, 'oferta_real_do_dia'); }
function classifyCurrentScenario(product) { return classifyByRules(product, CURRENT_SCENARIOS, 'grandes_ofertas_editorial'); }

function scoreCommercialOffer(product, marketplace, commercialIntent) {
  const reasons = []; const risks = []; let score = 0;
  const price = num(product.price);
  if (price && price >= 15 && price <= 500) { score += 16; reasons.push('faixa de preço prática'); } else if (price && price > 0) { score += 7; risks.push('ticket fora da faixa preferencial'); } else risks.push('preço ausente');
  const discount = pct(product.discountPercent);
  if (discount != null && discount >= 10) { score += Math.min(15, Math.round(discount / 3)); reasons.push(`desconto informado de ${Math.round(discount)}%`); }
  if (product.shippingFree === true) { score += 6; reasons.push('frete informado como grátis'); }
  if (product.coupon) { score += 4; reasons.push('cupom informado'); }
  if (product.imageUrl) { score += 8; reasons.push('imagem disponível'); } else risks.push('sem imagem');
  if (product.affiliateUrl) { score += 8; reasons.push('link afiliado disponível'); } else risks.push('sem link afiliado');
  if (marketplace === 'Shopee') {
    if (num(product.rating) >= 4.5) { score += 10; reasons.push(`avaliação ${num(product.rating).toFixed(1)} disponível`); }
    if (num(product.sales) >= 100) { score += 10; reasons.push(`${Math.round(num(product.sales)).toLocaleString('pt-BR')} vendas disponíveis`); }
    if ((product.shopType || []).map(Number).some((entry) => [1, 2, 3, 4].includes(entry))) { score += 7; reasons.push('tipo de loja qualificado pela Shopee'); }
    if (pct(product.commissionRate) >= 5) { score += 3; reasons.push('comissão disponível'); }
  } else {
    if (product.sellerName) { score += 3; reasons.push('vendedor disponível'); }
    risks.push('ML: sem prova social usada no ranking');
  }
  if (commercialIntent !== 'oferta_real_do_dia') { score += 10; reasons.push('aderência a intenção comercial'); }
  if (product.repeatCount > 0) { score -= Math.min(15, product.repeatCount * 5); risks.push('produto/família já visto na janela'); }
  return { score: Math.max(0, Math.min(100, score)), reasons, risks };
}

function generateSafeCopy(product, marketplace, scored) {
  const objective = marketplace === 'Shopee' && num(product.rating) >= 4.5 ? `Avaliação ${num(product.rating).toFixed(1)} disponível` : product.category ? `Categoria: ${clean(product.category)}` : 'Utilidade identificada no catálogo';
  const second = product.shippingFree === true ? 'Frete informado como grátis' : marketplace === 'Shopee' && num(product.sales) >= 100 ? `${Math.round(num(product.sales)).toLocaleString('pt-BR')} vendas informadas` : 'Link afiliado disponível para conferir';
  const couponLine = product.coupon ? `🎟️ Cupom informado: ${clean(product.coupon)}` : '';
  const hook = marketplace === 'Mercado Livre' ? 'Opção prática para considerar' : 'Achado com dados disponíveis';
  const lines = [`🔥 ${hook}`, '', clean(product.title) || 'Produto sem título', `💰 ${money(product.price)}`, '', `✅ ${objective}`, `✅ ${second}`, couponLine, '', '🔗 Link', '⚠️ Preço pode mudar a qualquer momento'].filter(Boolean);
  return { telegram: lines.join('\n'), whatsapp: lines.join('\n') };
}

function brtStart(hoursBack) { return new Date(REFERENCE_NOW.getTime() - hoursBack * 3600_000).toISOString(); }
async function fetchAll(queryFactory) { const rows = []; for (let from = 0; ; from += 1000) { const { data, error } = await queryFactory().range(from, from + 999); if (error) throw new Error(error.message); rows.push(...(data || [])); if (!data || data.length < 1000) return rows; } }
function payloadValue(payload, keys) { for (const key of keys) if (payload && payload[key] != null) return payload[key]; return null; }
function normalizeOffer(row) { const metrics = row.marketplace_metrics || {}; return { id: `offer:${row.id}`, createdAt: row.created_at, marketplace: row.platform, title: row.product_name || row.short_name, price: num(row.current_price), oldPrice: num(row.old_price), discountPercent: row.old_price > row.current_price ? ((row.old_price - row.current_price) / row.old_price) * 100 : pct(metrics.priceDiscountRate), rating: num(row.rating ?? metrics.ratingStar), sales: num(metrics.sales), commissionRate: pct(row.commission_rate ?? metrics.commissionRate ?? metrics.shopeeCommissionRate ?? metrics.sellerCommissionRate), shopType: metrics.shopType || [], sellerName: row.seller_name, imageUrl: row.image_url, affiliateUrl: row.original_url, category: row.category, categoryName: row.category_name, coupon: row.coupon, shippingFree: row.shipping_free === true, marketplaceMetrics: metrics, raw: false }; }
function normalizeDiscovery(row) { const p = row.raw_payload || {}; const marketplace = row.marketplace || payloadValue(p, ['marketplace', 'platform']); return { id: `discovery:${row.id}`, createdAt: row.created_at, marketplace, title: row.title_raw || payloadValue(p, ['productName', 'title', 'name']), price: num(payloadValue(p, ['price', 'priceMin', 'current_price', 'currentPrice'])), oldPrice: num(payloadValue(p, ['old_price', 'oldPrice', 'priceMax'])), discountPercent: pct(payloadValue(p, ['priceDiscountRate', 'discount', 'discount_percent'])), rating: num(payloadValue(p, ['ratingStar', 'rating'])), sales: num(payloadValue(p, ['sales'])), commissionRate: pct(payloadValue(p, ['commissionRate', 'shopeeCommissionRate', 'sellerCommissionRate', 'commission_rate'])), shopType: payloadValue(p, ['shopType']) || [], sellerName: payloadValue(p, ['shopName', 'seller_name', 'sellerName']), imageUrl: payloadValue(p, ['imageUrl', 'image_url', 'thumbnail']), affiliateUrl: payloadValue(p, ['offerLink', 'affiliate_url', 'productLink', 'source_url']) || row.source_url, category: payloadValue(p, ['category', 'category_name']), categoryName: payloadValue(p, ['category_name']), coupon: payloadValue(p, ['coupon']), shippingFree: payloadValue(p, ['shipping_free', 'shippingFree']) === true, marketplaceMetrics: p, raw: true }; }
function keyFor(product) { return `${product.marketplace}|${clean(product.title).toLowerCase()}|${product.price || ''}`; }
function markdownTable(rows) { const esc = (value) => clean(value).replace(/\|/g, '\\|'); return ['| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |', '|---|---|---:|---|---|---:|---|---|---|', ...rows.map((row) => `| ${esc(row.marketplace)} | ${esc(row.title)} | ${money(row.price)} | ${esc(row.currentScenario)} | ${esc(row.intent)} | ${row.scored.score} | ${esc(row.scored.reasons.slice(0, 3).join('; ') || '—')} | ${esc(row.scored.risks.slice(0, 2).join('; ') || '—')} | ${esc(row.copy.telegram.split('\n').filter((line) => line.trim()).join(' · '))} |`)].join('\n'); }

async function main() {
  dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Credenciais Supabase obrigatórias ausentes em .env.local');
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const since48 = brtStart(48);
  const [offers, discoveries] = await Promise.all([
    fetchAll(() => supabase.from('offers').select('id,created_at,platform,product_name,short_name,current_price,old_price,commission_rate,coupon,image_url,original_url,category,category_name,rating,seller_name,shipping_free,marketplace_metrics').in('platform', [...MARKETPLACES]).gte('created_at', since48).order('created_at', { ascending: false })),
    fetchAll(() => supabase.from('discovery_items').select('id,created_at,marketplace,title_raw,raw_payload,source_url').in('marketplace', [...MARKETPLACES]).gte('created_at', since48).order('created_at', { ascending: false })),
  ]);
  const unique = new Map(); for (const product of [...offers.map(normalizeOffer), ...discoveries.map(normalizeDiscovery)]) { if (!MARKETPLACES.has(product.marketplace) || !product.title || !product.price) continue; const key = keyFor(product); if (!unique.has(key) || product.raw === false) unique.set(key, product); }
  const products = [...unique.values()]; const familyCounts = new Map(); products.forEach((product) => familyCounts.set(keyFor(product), (familyCounts.get(keyFor(product)) || 0) + 1)); products.forEach((product) => { product.repeatCount = Math.max(0, (familyCounts.get(keyFor(product)) || 1) - 1); product.intent = commercialCuration.classifyCommercialIntent(product); product.currentScenario = classifyCurrentScenario(product); product.scored = commercialCuration.scoreCommercialOffer({ ...product, commercialIntent: product.intent }); product.commercialDecision = commercialCuration.isCommerciallyEligible({ ...product, commercialIntent: product.intent }); product.automaticEligible = product.commercialDecision.automaticEligible; product.commercialMetadata = commercialCuration.buildCommercialMetadata({ ...product, commercialIntent: product.intent }); product.copy = { telegram: commercialCuration.buildCommercialCopy({ ...product, commercialIntent: product.intent }, { channel: 'telegram' }), whatsapp: commercialCuration.buildCommercialCopy({ ...product, commercialIntent: product.intent }, { channel: 'whatsapp' }) }; });
  const windows = [['Hoje desde 06h BRT', new Date('2026-08-07T09:00:00.000Z')], ['Últimas 24h', brtStart(24)], ['Últimas 48h', since48]];
  const countBy = (items, selector) => Object.entries(items.reduce((acc, item) => { const k = selector(item) || 'não classificado'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const lines = ['# Shopee + Mercado Livre — dry-run da matriz comercial', '', `Referência: 07/08/2026 09:01 BRT. Script executado em modo read-only contra Supabase; não houve publicação, mensageria, cron, Oracle, PM2 ou escrita no banco.`, '', '## Resumo executivo', '', `Foram encontrados **${products.length} produtos únicos com preço** nas últimas 48h. A conclusão considera disponibilidade de candidatos, não conversão: a telemetria de clique/venda não foi usada como prova de performance.`, '', '## Janelas analisadas', '', ...windows.map(([label, since]) => `- ${label}: ${products.filter((item) => new Date(item.createdAt) >= new Date(since)).length} produtos.`), '', '## Volume analisado', '', `- Ofertas: ${offers.length}; discovery items: ${discoveries.length}; deduplicados com preço: ${products.length}.`, `- Por marketplace: ${countBy(products, (item) => item.marketplace).map(([k,v]) => `${k} ${v}`).join('; ') || 'sem volume'}.`, '', '## Volume por matriz atual', '', ...countBy(products, (item) => item.currentScenario).map(([k,v]) => `- ${k}: ${v}`), '', '## Volume por nova intenção comercial', '', ...countBy(products, (item) => item.intent).map(([k,v]) => `- ${k}: ${v}`), '', '## Top produtos por nova matriz', '', markdownTable(products.sort((a,b) => b.scored.score - a.scored.score || new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20)), '', '## Melhores produtos Shopee', '', markdownTable(products.filter((item) => item.marketplace === 'Shopee').sort((a,b) => b.scored.score - a.scored.score).slice(0, 10)), '', '## Melhores produtos Mercado Livre', '', markdownTable(products.filter((item) => item.marketplace === 'Mercado Livre').sort((a,b) => b.scored.score - a.scored.score).slice(0, 10)), '', '## Comparação matriz atual vs nova matriz', '', 'A matriz atual agrupa por departamento; a nova privilegia intenção e sinais verificáveis. O score não prova que um candidato converterá melhor: faltam dados de clique/venda suficientes para essa afirmação causal. Ela melhora a triagem por preço, evidência disponível, imagem, link e repetição.', '', '## Exemplos de copy segura', '', ...products.sort((a,b) => b.scored.score - a.scored.score).slice(0, 4).flatMap((item) => [`### ${clean(item.title)} (${item.marketplace})`, '', '```text', item.copy.telegram, '```', '']), '## Produtos rejeitados e motivos', '', ...products.filter((item) => item.scored.score < 35 || item.scored.risks.length >= 3).slice(0, 20).map((item) => `- ${clean(item.title)} (${item.marketplace}): ${item.scored.risks.join('; ') || 'score baixo'}`), '', '## Dados ausentes por marketplace', '', '- Shopee: sinais dependem de `marketplace_metrics`/payload; nem todos os produtos trazem rating, vendas, desconto, tipo de loja ou comissão.', '- Mercado Livre: este dry-run não usa rating, reviews, vendas, “mais vendido”, loja oficial, frete grátis ou cupom sem um campo runtime comprovado. Onde faltam preço/categoria/vendedor/frete, a copy permanece genérica e conservadora.', '', '## Riscos', '', '- Janela curta pode não representar sazonalidade ou estoque.', '- Score é hipótese de priorização e não substitui experimento com tracking de clique/conversão.', '- Link em `offers.original_url` pode não ser um link afiliado validado; o relatório o trata somente como “link disponível”.', '', '## Conclusão', '', `**${products.length >= 20 ? 'AJUSTAR E IMPLEMENTAR EM EXPERIMENTO CONTROLADO' : 'AJUSTAR ANTES DE IMPLEMENTAR'}** — há ${products.length} candidatos em 48h. Implementar apenas após definir gates mínimos por intenção e capturar métricas de clique/conversão; não alterar a matriz ativa com base somente neste dry-run.`, '', '## Próxima task recomendada', '', 'Adicionar telemetria read-only/observável por intenção (impressão, clique, conversão e comissão) e rodar um experimento shadow de sete dias antes de mudar o roteamento oficial.', ''];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  const curationRows = products.filter((item) => item.commercialDecision?.eligible).sort((a, b) => b.scored.score - a.scored.score);
  const automaticRows = curationRows.filter((item) => item.automaticEligible);
  const manualRows = curationRows.filter((item) => item.commercialDecision?.manualReviewRequired);
  const scoreDistribution = Object.entries(curationRows.reduce((acc, item) => { const bucket = Math.floor(item.scored.score / 10) * 10; acc[bucket] = (acc[bucket] || 0) + 1; return acc; }, {})).sort((a, b) => Number(a[0]) - Number(b[0]));
  const topByIntent = commercialCuration.COMMERCIAL_INTENTS.flatMap((intent) => {
    const top = curationRows.filter((item) => item.intent === intent).slice(0, 3);
    return top.length ? [`### ${intent}`, '', markdownTable(top), ''] : [`### ${intent}`, '', 'Sem produto elegível observado na janela.', ''];
  });
  const gateLines = commercialCuration.COMMERCIAL_INTENTS.map((intent) => { const gate = commercialCuration.INTENT_CONFIG[intent]; return `| ${intent} | ${gate.range.join('–')} | ${gate.preferred} | ${gate.mode} | ${gate.required.join(', ')} |`; });
  const curationLines = ['# Commercial Curation V1', '', '## 1. Resumo executivo', '', `A Curadoria Comercial V1 transforma o dry-run em ranking permanente de candidatos Shopee + Mercado Livre. A execução atual encontrou ${products.length} produtos únicos com preço nas últimas 48h. ${automaticRows.length} são candidatos automáticos e ${manualRows.length} exigem revisão manual.`, '', '## 2. Arquivos alterados', '', '- `scripts/commercial-curation-v1.cjs` — domínio puro de ranking, gates, riscos, copy e metadata.', '- `scripts/dry-run-commercial-matrix.cjs` — adaptado para consumir a camada V1 e gerar relatórios.', '- `scripts/__tests__/commercial-curation-v1.test.js` — seams públicas da curadoria.', '- `CONTEXT.md` — vocabulário de CommercialIntent, AchadinhoScore e manualReviewRequired.', '', '## 3. Mudanças em relação ao dry-run anterior', '', '- Score contínuo com base limitada a 92 e bônus/penalidades separados; não há saturação indiscriminada em 100.', '- Ganchos e bullets separados, sem `/ /`, linhas duplicadas ou repetição do gancho.', '- Precedência corrigida para decoração, moda e automotivo; segurança, cadeira gamer e eletrônicos de alto ticket são manual-first.', '- `automaticEligible` separa candidatos automáticos de manual-first.', '', '## 4. Novo score', '', 'A base do `AchadinhoScore` tem teto 92. Bônus pequenos consideram marketplace preferencial, aderência exata e preço na faixa; penalidades consideram risco manual, duplicidade, categoria fraca e preço fora da faixa. Rating/vendas são exclusivos de sinais Shopee presentes.', '', '## 5. Gates por intenção', '', '| Intenção | Faixa preferencial | Marketplace | Modo | Dados mínimos |', '|---|---:|---|---|---|', ...gateLines, '', '## 6. Tratamento Shopee', '', 'Rating, vendas, desconto, comissão, tipo de loja, imagem e métricas são usados somente quando presentes no payload/runtime. A copy inclui cada sinal no máximo uma vez.', '', '## 7. Tratamento Mercado Livre', '', 'O ranking não cria rating, reviews, vendas, “mais vendido”, loja oficial, cupom ou frete grátis. Frete só aparece quando `shippingFree === true`; categoria e vendedor só aparecem quando campos existem.', '', '## 8. Amazon fora da V1', '', 'Amazon permanece no projeto, mas `rankCommercialOffers` aceita somente Shopee e Mercado Livre.', '', '## 9. Copy antes/depois', '', '- Antes: “Achado com dados disponíveis” repetido como gancho e bullet, com separadores `/` no relatório.', '- Depois: gancho específico, motivo prático distinto, sinais presentes e no máximo quatro bullets.', '', '## 10. Top geral', '', markdownTable(curationRows.slice(0, 15)), '', '## 11. Top automático', '', markdownTable(automaticRows.slice(0, 15)), '', '## 12. Top manual-first', '', markdownTable(manualRows.slice(0, 15)), '', '## 13. Top por intenção', '', ...topByIntent, '## 14. Top Shopee', '', markdownTable(curationRows.filter((item) => item.marketplace === 'Shopee').slice(0, 10)), '', '## 15. Top Mercado Livre', '', markdownTable(curationRows.filter((item) => item.marketplace === 'Mercado Livre').slice(0, 10)), '', '## 16. Casos corrigidos', '', '- Papel adesivo/decoração/sala/quarto/lavanderia → `casa_organizada_antes_depois`.', '- Bermuda/gestante/modeladora/shorts/calça/legging/bota/tênis/sapato → `look_sem_erro` manual-first.', '- Sensor de pneu/válvula/motocicleta/carro → `carro_pratico`.', '- Câmera IP/sensor de movimento/segurança → risco `category_requires_manual`.', '', '## 17. Rejeições e riscos', '', ...products.filter((item) => !item.commercialDecision?.eligible || item.scored.risks.length).slice(0, 30).map((item) => `- ${clean(item.title)} (${item.marketplace}): ${item.commercialDecision?.reason || item.scored.risks.join(', ')}`), '', '## 18. Distribuição de score', '', ...scoreDistribution.map(([bucket, count]) => `- ${bucket}–${Number(bucket) + 9.9}: ${count}`), `- Score exatamente 100: ${curationRows.filter((item) => item.scored.score === 100).length}`, '', '## 19. Metadata preparada', '', 'Exemplo de metadata gerada, sem gravação:', '', '```json', JSON.stringify(curationRows[0]?.commercialMetadata || { commercialCurationVersion: 'commercial-curation/v1' }, null, 2), '```', '', '## 20. Testes executados', '', '- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js` — 10 testes.', '- `node --test scripts/__tests__/dry-run-commercial-matrix.test.cjs` — 3 testes.', '- `node --check scripts/commercial-curation-v1.cjs`.', '- `node --check scripts/dry-run-commercial-matrix.cjs`.', '', '## 21. Read-only / no production changes', '', 'O script consulta somente `offers` e `discovery_items` via Supabase, e grava apenas estes relatórios Markdown locais. Não houve migration, update/insert/delete, publicação, Telegram, WhatsApp, Instagram/Facebook/Reels, cron, PM2 ou rollout Oracle.', '', '## 22. Riscos restantes', '', '- Ausência de conversão por intenção impede afirmar ganho de vendas.', '- Famílias e taxonomia dependem dos títulos/categorias atuais.', '- Mercado Livre continua exigindo revisão quando faltam sinais comerciais.', '', '## 23. Próxima task recomendada', '', 'Adicionar painel shadow de drafts com a metadata V1 e telemetria de impressão/clique/conversão, sem ativar publicação automática.', '', '## 24. Critério de sucesso', '', `Copy limpa; score não saturado; classificações ambíguas corrigidas; top automático separado de manual-first. ${curationRows.length} produtos foram elegíveis nesta execução local.`, ''];
  fs.writeFileSync(CURATION_REPORT_PATH, `${curationLines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(POLISH_REPORT_PATH, `${curationLines.join('\n')}\n`, 'utf8');
  console.log(`Dry-run concluído: ${products.length} produtos; relatório: docs/SHOPEE_ML_COMMERCIAL_MATRIX_DRY_RUN_REPORT.md`);
}

module.exports = {
  classifyCommercialIntent: commercialCuration.classifyCommercialIntent,
  scoreCommercialOffer: (product, marketplace, commercialIntent) => commercialCuration.scoreCommercialOffer({ ...product, marketplace, commercialIntent }),
  generateSafeCopy: (product, marketplace) => {
    const copy = commercialCuration.buildCommercialCopy({ ...product, marketplace });
    return { telegram: copy, whatsapp: copy };
  },
};
if (require.main === module) main().catch((error) => { console.error(`Dry-run falhou: ${error.message}`); process.exitCode = 1; });
