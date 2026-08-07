'use strict';

const COMMERCIAL_CURATION_VERSION = 'commercial-curation/v1';
const COPY_VERSION = 'commercial-copy/v1';
const ALLOWED_MARKETPLACES = Object.freeze(['Shopee', 'Mercado Livre']);
const COMMERCIAL_INTENTS = Object.freeze([
  'utilidade_casa_essencial', 'casa_organizada_antes_depois', 'tech_de_bolso',
  'upgrade_trabalho_estudo', 'look_sem_erro',
  'autocuidado_que_resolve', 'pet_recorrente_e_util', 'carro_pratico',
  'faca_voce_mesmo_leve', 'lazer_gamer_acessorio', 'audio_e_gadget_visual',
  'eletro_validado_para_casa', 'casa_escritorio_comparado', 'oferta_real_do_dia',
  'cupons_verificados_manual', 'movimento_em_casa'
]);

const INTENT_CONFIG = Object.freeze(Object.fromEntries(Object.entries({
  utilidade_casa_essencial: { range: [15, 180], positive: /cozinha|panela|pote|utens[ií]lio|limpeza|casa|lixeira|varal|torneira|tapete/i, risk: /rem[eé]dio|suplement|beb[eê]|el[eé]trico industrial/i, preferred: 'shopee', mode: 'automatic', required: ['price', 'affiliateUrl'], hook: 'Pra resolver a rotina da casa' },
  casa_organizada_antes_depois: { range: [15, 250], positive: /organiza|gaveta|cabide|prateleira|caixa|cesto|arm[aá]rio|suporte/i, risk: /m[oó]vel grande|guarda roupa|sof[aá]|estante grande/i, preferred: 'shopee', mode: 'automatic', required: ['price', 'affiliateUrl', 'imageUrl'], hook: 'Organização simples que ajuda de verdade' },
  tech_de_bolso: { range: [15, 500], positive: /celular|smartphone|carregador|power bank|cabo|capinha|pel[ií]cula|smartwatch/i, risk: /iphone pro max|notebook gamer|celular premium/i, preferred: 'mercadolivre', mode: 'automatic', required: ['price', 'affiliateUrl'], hook: 'Acessório tech com preço interessante' },
  upgrade_trabalho_estudo: { range: [30, 700], positive: /notebook|teclado|mouse|monitor|escrit[oó]rio|mesa|cadeira|webcam|suporte.*notebook/i, risk: /notebook gamer|workstation/i, preferred: 'mercadolivre', mode: 'manual-first', required: ['price', 'affiliateUrl'], hook: 'Upgrade prático para trabalho ou estudo' },
  look_sem_erro: { range: [20, 450], positive: /bermuda|gestante|modeladora|shorts|camisa|cal[cç]a|legging|bota|t[eê]nis|sapato|vestido|[oó]culos|moda|roupa/i, risk: /tamanho|numera[cç][aã]o|gestante|modeladora/i, preferred: 'shopee', mode: 'manual-first', required: ['price', 'affiliateUrl'], hook: 'Achado para compor o look' },
  autocuidado_que_resolve: { range: [15, 300], positive: /beleza|maquiagem|skincare|hidratante|secador|barbeador|perfume|depilador/i, risk: /emagrec|cura|trata|doen[cç]a|medicamento/i, preferred: 'shopee', mode: 'manual-first', required: ['price', 'affiliateUrl'], hook: 'Achado prático para autocuidado' },
  pet_recorrente_e_util: { range: [15, 250], positive: /\bpet\b|cachorro|gato|areia|ra[cç][aã]o|coleira|tapete higi[eê]nico/i, risk: /antipulgas|medicamento|tratamento/i, preferred: 'mercadolivre', mode: 'manual-first', required: ['price', 'affiliateUrl'], hook: 'Achado útil para pet no dia a dia' },
  carro_pratico: { range: [20, 600], positive: /carro|automotivo|ve[ií]culo|moto|painel|capacete|pneu|sensor|v[aá]lvula/i, risk: /seguran[cç]a|airbag|freio|pe[cç]a cr[ií]tica/i, preferred: 'mercadolivre', mode: 'manual-first', required: ['price', 'affiliateUrl'], hook: 'Praticidade para cuidar do carro' },
  faca_voce_mesmo_leve: { range: [15, 350], positive: /ferramenta|furadeira|parafuso|chave|broca|alicate|fita|lixa/i, risk: /industrial|profissional pesada|alta tens[aã]o/i, preferred: 'shopee', mode: 'automatic', required: ['price', 'affiliateUrl'], hook: 'Ferramenta útil para resolver em casa' },
  lazer_gamer_acessorio: { range: [20, 600], positive: /gamer|jogo|gamepad|controle|playstation|xbox|nintendo/i, risk: /console|placa de v[ií]deo|notebook gamer/i, preferred: 'mercadolivre', mode: 'manual-first', required: ['price', 'affiliateUrl'], hook: 'Acessório gamer para curtir melhor' },
  audio_e_gadget_visual: { range: [20, 450], positive: /fone|headphone|caixa de som|soundbar|microfone|bluetooth/i, risk: /profissional|est[uú]dio|equipamento de palco/i, preferred: 'shopee', mode: 'automatic', required: ['price', 'affiliateUrl', 'imageUrl'], hook: 'Gadget visual com preço interessante' },
  eletro_validado_para_casa: { range: [50, 700], positive: /air fryer|liquidificador|cafeteira|aspirador|geladeira|lavadora|ventilador/i, risk: /geladeira|lavadora|forno grande/i, preferred: 'mercadolivre', mode: 'manual-first', required: ['price', 'affiliateUrl', 'imageUrl'], hook: 'Eletro para facilitar a rotina da casa' },
  casa_escritorio_comparado: { range: [30, 500], positive: /m[oó]vel|cadeira|mesa|estante|escrit[oó]rio|lumin[aá]ria|c[aâ]mera ip|sensor de movimento|alarme|vigil[aâ]ncia|seguran[cç]a/i, risk: /sof[aá]|guarda roupa|arm[aá]rio grande|rack grande|c[aâ]mera ip|sensor de movimento|alarme|vigil[aâ]ncia|seguran[cç]a/i, preferred: 'mercadolivre', mode: 'manual-first', required: ['price', 'affiliateUrl', 'imageUrl'], hook: 'Boa opção para casa ou escritório' },
  oferta_real_do_dia: { range: [15, 500], positive: /oferta|promo[cç][aã]o|desconto/i, risk: /milagre|imperd[ií]vel|urgente/i, preferred: 'shopee', mode: 'automatic', required: ['price', 'affiliateUrl'], hook: 'Oferta forte para olhar agora' },
  cupons_verificados_manual: { range: [15, 500], positive: /cupom/i, risk: /sem condi[cç][aã]o|expirado/i, preferred: 'mercadolivre', mode: 'manual-first', required: ['price', 'affiliateUrl'], hook: 'Cupom verificado para aproveitar' },
  movimento_em_casa: { range: [15, 500], positive: /treino|fitness|muscula[cç][aã]o|academia|funcional|exerc[ií]cio|alongamento|resist[eê]ncia|el[aá]stico|extensor|yoga|pilates|gl[uú]teos|bra[cç]os|pernas|abd[oô]men|bike|corrida|esporte|esportivo/i, risk: /suplement|medicamento|emagrec|cura|trata|doen[cç]a/i, preferred: 'shopee', mode: 'manual-first', required: ['price', 'affiliateUrl'], hook: 'Movimento em casa' },
}).map(([intent, config]) => [intent, {
  ...config,
  copyAllowed: ['intent_hook', 'price', 'category_when_present', 'marketplace_proof_when_present'],
  copyProhibited: ['unsupported_claims', 'false_urgency', 'unverified_discount', 'unverified_coupon'],
}])));

function number(value) { if (value == null || String(value).trim() === '') return null; const parsed = Number(String(value).replace(',', '.')); return Number.isFinite(parsed) ? parsed : null; }
function percent(value) { const parsed = number(value); return parsed != null && parsed > 0 && parsed <= 1 ? parsed * 100 : parsed; }
function text(product) { return `${product?.title || ''} ${product?.category || ''} ${product?.categoryName || ''}`.toLocaleLowerCase('pt-BR'); }
function clean(value) { return String(value || '').replace(/[|\n\r]+/g, ' ').trim(); }
function money(value) { return `R$ ${number(value)?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '—'}`; }
const MOVEMENT_IN_HOME_TERMS = /treino|fitness|muscula[cç][aã]o|academia|funcional|exerc[ií]cio|alongamento|resist[eê]ncia|el[aá]stico|extensor|yoga|pilates|gl[uú]teos|bra[cç]os|pernas|abd[oô]men|bike|corrida|esporte|esportivo/i;
function classifyCommercialIntent(product = {}) {
  const value = text(product);
  if (MOVEMENT_IN_HOME_TERMS.test(value)) return 'movimento_em_casa';
  if (/c[aâ]mera ip|c[aâ]mera de seguran[cç]a|sensor de movimento|alarme|vigil[aâ]ncia|seguran[cç]a/i.test(value)) return 'casa_escritorio_comparado';
  if (/varal|mop|lixeira|sapateira|organizador|organiza[cç][aã]o|cesto|prateleira/i.test(value)) return 'casa_organizada_antes_depois';
  if (/[oó]culos.*(festa|brinde|evento)|(?:festa|brinde|evento).*[oó]culos/i.test(value)) return 'look_sem_erro';
  if (/papel adesivo|adesivo de parede|decora[cç][aã]o|sala|quarto|lavanderia/i.test(value)) return 'casa_organizada_antes_depois';
  if (/bermuda|gestante|modeladora|shorts|cal[cç]a|legging|bota|t[eê]nis|sapato|vestido|moda|roupa/i.test(value)) return 'look_sem_erro';
  if (/sensor pneu|v[aá]lvula|motocicleta|carro|automotivo|ve[ií]culo/i.test(value)) return 'carro_pratico';
  const classificationOrder = ['movimento_em_casa', 'audio_e_gadget_visual', 'lazer_gamer_acessorio', 'upgrade_trabalho_estudo', 'tech_de_bolso', 'eletro_validado_para_casa', 'carro_pratico', 'pet_recorrente_e_util', 'autocuidado_que_resolve', 'faca_voce_mesmo_leve', 'casa_escritorio_comparado', 'casa_organizada_antes_depois', 'utilidade_casa_essencial', 'oferta_real_do_dia', 'cupons_verificados_manual'];
  const match = classificationOrder.find((intent) => INTENT_CONFIG[intent].positive.test(value));
  return match || 'oferta_real_do_dia';
}
function configFor(product) { return INTENT_CONFIG[product.commercialIntent || classifyCommercialIntent(product)] || INTENT_CONFIG.oferta_real_do_dia; }

function getCommercialRiskFlags(product = {}) {
  const flags = []; const value = text(product); const config = configFor(product);
  if (number(product.price) == null || number(product.price) <= 0) flags.push('missing_price');
  if (!product.affiliateUrl && !product.link && !product.url) flags.push('missing_link');
  if (!product.imageUrl) flags.push('missing_image');
  if (product.marketplace === 'Mercado Livre' && number(product.rating) == null && number(product.sales) == null) flags.push('ml_missing_social_proof');
  if (!config.positive.test(value)) flags.push('weak_commercial_intent');
  if (config.risk.test(value)) flags.push('category_requires_manual');
  if (number(product.price) > 800) flags.push('high_ticket_requires_manual');
  if (/sof[aá]|guarda roupa|arm[aá]rio grande|rack grande|estante grande|cadeira gamer/i.test(value)) { flags.push('large_furniture_manual'); flags.push('large_or_freight_sensitive_manual'); }
  if (/smartphone|notebook|tablet|computador gamer|placa de v[ií]deo/i.test(value)) flags.push('electronics_high_ticket_manual');
  if (/c[aâ]mera ip|c[aâ]mera de seguran[cç]a|sensor de movimento|alarme|vigil[aâ]ncia|seguran[cç]a/i.test(value)) { flags.push('category_requires_manual'); flags.push('security_camera_manual'); }
  if (/tamanho|numera[cç][aã]o|vestido|cal[cç]a|sapato|t[eê]nis|suti[aã]|jeans/i.test(value) && /moda|roupa|cal[cç]a|vestido|sapato|t[eê]nis|fashion/i.test(value)) flags.push('fashion_size_complexity');
  if (/medicamento|rem[eé]dio|suplement|emagrec|cura|trata|doen[cç]a|antipulgas/i.test(value)) flags.push('regulated_or_sensitive');
  if (product.marketplace === 'Shopee' && (!product.marketplaceMetrics || Object.keys(product.marketplaceMetrics).length === 0)) flags.push('marketplace_metrics_missing');
  if (number(product.repeatCount) > 0 || product.isRepeated === true) flags.push('duplicated_family_recent');
  return [...new Set(flags)];
}

function scoreCommercialOffer(product = {}) {
  const marketplace = product.marketplace; const intent = product.commercialIntent || classifyCommercialIntent(product); const config = INTENT_CONFIG[intent] || INTENT_CONFIG.oferta_real_do_dia;
  const risks = getCommercialRiskFlags({ ...product, commercialIntent: intent }); const reasons = []; let baseScore = 0; let bonus = 0;
  const price = number(product.price); const [low, high] = config.range;
  if (price != null && price >= low && price <= high) { baseScore += 20; reasons.push('preço na faixa preferencial'); } else if (price != null && price > 0) { baseScore += 7; reasons.push('preço disponível fora da faixa preferencial'); }
  const discount = percent(product.discountPercent ?? product.discount ?? product.marketplaceMetrics?.priceDiscountRate);
  if (discount != null && discount > 0) { baseScore += Math.min(10, 3 + discount / 10); reasons.push(`desconto informado de ${Math.round(discount)}%`); }
  if (product.imageUrl) { baseScore += 8; reasons.push('imagem disponível'); }
  if (product.affiliateUrl || product.link || product.url) { baseScore += 8; reasons.push('link disponível'); }
  if (config.positive.test(text(product))) { baseScore += 14; reasons.push('aderência à intenção'); }
  else baseScore -= 8;
  if (marketplace === 'Shopee') {
    if (number(product.rating) >= 4.5) { baseScore += 10; reasons.push(`avaliação ${number(product.rating).toFixed(1)} disponível`); }
    if (number(product.sales) >= 100) { baseScore += Math.min(10, 3 + Math.log10(number(product.sales)) * 1.7); reasons.push(`${Math.round(number(product.sales)).toLocaleString('pt-BR')} vendas informadas`); }
    if (product.marketplaceMetrics && Object.keys(product.marketplaceMetrics).length) { baseScore += 3; reasons.push('marketplace_metrics disponível'); }
    if (Array.isArray(product.shopType) && product.shopType.length) { baseScore += 2; reasons.push('tipo de loja informado'); }
  } else {
    if (product.shippingFree === true) { baseScore += 5; reasons.push('frete informado como grátis'); }
    if (product.category || product.categoryName) { baseScore += 5; reasons.push('categoria/domínio disponível'); }
    if (product.sellerName) { baseScore += 2; reasons.push('vendedor disponível'); }
  }
  if (!risks.includes('duplicated_family_recent')) { baseScore += 5; reasons.push('baixa repetição'); } else baseScore -= 8;
  if (marketplace === config.preferred) { bonus += 2; reasons.push('marketplace preferencial'); }
  if (config.positive.test(text(product))) { bonus += 1; }
  if (price != null && price >= low && price <= high) bonus += 1;
  const hardPenalty = risks.filter((flag) => ['regulated_or_sensitive', 'large_furniture_manual', 'large_or_freight_sensitive_manual', 'electronics_high_ticket_manual', 'category_requires_manual', 'security_camera_manual'].includes(flag)).length * 10;
  const cappedBase = Math.min(92, Math.max(0, baseScore - hardPenalty));
  const score = Math.max(0, Math.min(100, Math.round((cappedBase + bonus) * 10) / 10));
  return { score, baseScore: Math.round(cappedBase * 10) / 10, bonus, reasons, risks, commercialIntent: intent, marketplace };
}

function isCommerciallyEligible(product = {}) {
  const marketplace = product.marketplace; const risks = getCommercialRiskFlags(product); const config = configFor(product);
  const missingRequired = config.required.filter((field) => { const value = field === 'affiliateUrl' ? (product.affiliateUrl || product.link || product.url) : product[field]; return value == null || value === ''; });
  const eligible = ALLOWED_MARKETPLACES.includes(marketplace) && missingRequired.length === 0 && !risks.includes('weak_commercial_intent') && !risks.includes('regulated_or_sensitive');
  const manualReviewRequired = eligible && (config.mode !== 'automatic' || risks.some((flag) => flag.endsWith('_manual') || ['fashion_size_complexity', 'category_requires_manual', 'ml_missing_social_proof'].includes(flag)));
  return { eligible, isEligible: eligible, manualReviewRequired, automaticEligible: eligible && !manualReviewRequired, missingRequired, risks, reason: !eligible ? (missingRequired.length ? `dados obrigatórios ausentes: ${missingRequired.join(', ')}` : 'marketplace, intenção ou risco bloqueante') : manualReviewRequired ? 'manual-first ou risco requer revisão' : 'gate automático aprovado' };
}

function rankCommercialOffers(products = [], options = {}) {
  const ranked = products.filter((product) => ALLOWED_MARKETPLACES.includes(product.marketplace)).map((product) => {
    const commercialIntent = product.commercialIntent || classifyCommercialIntent(product); const decision = isCommerciallyEligible({ ...product, commercialIntent }); const score = scoreCommercialOffer({ ...product, commercialIntent });
    return { ...product, commercialIntent, ...score, decision, manualReviewRequired: decision.manualReviewRequired, automaticEligible: decision.automaticEligible, metadata: buildCommercialMetadata({ ...product, commercialIntent }) };
  }).filter((product) => product.decision.eligible || options.includeRejected === true);
  ranked.sort((a, b) => b.score - a.score || (b.rating || 0) - (a.rating || 0) || (b.sales || 0) - (a.sales || 0) || String(a.title || '').localeCompare(String(b.title || '')));
  if (options.intent) return ranked.filter((product) => product.commercialIntent === options.intent).slice(0, options.limit || 20);
  return ranked.slice(0, options.limit || ranked.length);
}

function getHook(product, intent) { return INTENT_CONFIG[intent]?.hook || 'Produto prático para o dia a dia'; }
function buildCommercialCopy(product = {}, options = {}) {
  const intent = product.commercialIntent || classifyCommercialIntent(product); const marketplace = product.marketplace;
  const reasonByIntent = { utilidade_casa_essencial: 'Ajuda a resolver uma tarefa da casa', casa_organizada_antes_depois: 'Ajuda a aproveitar melhor o espaço', tech_de_bolso: 'Acessório simples para o uso diário', upgrade_trabalho_estudo: 'Pode melhorar a rotina de trabalho ou estudo', autocuidado_que_resolve: 'Prático para a rotina de autocuidado', pet_recorrente_e_util: 'Útil para uma necessidade recorrente do pet', carro_pratico: 'Ajuda em uma tarefa prática do carro', faca_voce_mesmo_leve: 'Útil para pequenos reparos em casa', lazer_gamer_acessorio: 'Acessório para complementar o lazer', audio_e_gadget_visual: 'Gadget visual para usar no dia a dia', eletro_validado_para_casa: 'Pode facilitar uma tarefa da casa', casa_escritorio_comparado: 'Opção para comparar conforme sua necessidade', look_sem_erro: 'Peça para compor o look do dia a dia', oferta_real_do_dia: 'Preço e condições para conferir', cupons_verificados_manual: 'Condição para conferência manual', movimento_em_casa: 'Ajuda no treino em casa' };
  const bullets = [`✅ ${reasonByIntent[intent] || 'Produto prático para o dia a dia'}`];
  if (marketplace === 'Shopee' && number(product.rating) >= 0.1) bullets.push(`✅ Avaliação ${number(product.rating).toFixed(1)}`);
  if (marketplace === 'Shopee' && number(product.sales) >= 1) bullets.push(`✅ ${Math.round(number(product.sales)).toLocaleString('pt-BR')} vendas informadas`);
  if (product.discountPercent != null && number(product.discountPercent) > 0) bullets.push(`✅ ${Math.round(number(product.discountPercent))}% OFF informado`);
  if (marketplace === 'Mercado Livre' && product.category) bullets.push(`✅ Categoria: ${clean(product.category)}`);
  if (product.shippingFree === true) bullets.push('✅ Frete grátis informado');
  const lines = [`🔥 ${options.hook || getHook(product, intent)}`, '', clean(product.title) || 'Produto sem título', `💰 ${money(product.price)}`, '', ...bullets.slice(0, 4), '', '🔗 Ver oferta', '⚠️ Preço e estoque podem mudar a qualquer momento'];
  return lines.join('\n');
}

function explainCommercialDecision(product = {}) { const score = scoreCommercialOffer(product); const decision = isCommerciallyEligible(product); return { eligible: decision.eligible, isEligible: decision.isEligible, manualReviewRequired: decision.manualReviewRequired, automaticEligible: decision.automaticEligible, score: score.score, commercialIntent: score.commercialIntent, reasons: score.reasons, risks: score.risks, missingRequired: decision.missingRequired, decisionReason: decision.reason }; }
function buildCommercialMetadata(product = {}) { const intent = product.commercialIntent || classifyCommercialIntent(product); const score = scoreCommercialOffer({ ...product, commercialIntent: intent }); const decision = isCommerciallyEligible({ ...product, commercialIntent: intent }); return { commercialCurationVersion: COMMERCIAL_CURATION_VERSION, commercialIntent: intent, achadinhoScore: score.score, commercialReasons: score.reasons, commercialRiskFlags: score.risks, recommendedChannel: getRecommendedChannel({ ...product, commercialIntent: intent }), copyVersion: COPY_VERSION, suggestedCopy: buildCommercialCopy({ ...product, commercialIntent: intent }), marketplaceFocus: product.marketplace === 'Mercado Livre' ? 'mercadolivre' : 'shopee', isEligible: decision.isEligible, manualReviewRequired: decision.manualReviewRequired, automaticEligible: decision.automaticEligible, manualReviewReason: decision.manualReviewRequired ? decision.reason : null, sourceScenarioId: product.sourceScenarioId || product.currentScenario || null }; }
function getRecommendedChannel(product = {}) { const decision = isCommerciallyEligible(product); return decision.manualReviewRequired ? 'panel_only' : 'telegram'; }

module.exports = { COMMERCIAL_CURATION_VERSION, COPY_VERSION, ALLOWED_MARKETPLACES, COMMERCIAL_INTENTS, INTENT_CONFIG, classifyCommercialIntent, scoreCommercialOffer, isCommerciallyEligible, rankCommercialOffers, buildCommercialCopy, explainCommercialDecision, buildCommercialMetadata, getCommercialRiskFlags, getRecommendedChannel };
