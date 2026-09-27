'use strict';

/**
 * Normaliza e identifica a família/nicho específico do produto com base no título e palavras-chave.
 * @param {string} title Título do produto
 * @param {string} [context] Categoria ou palavra-chave contextual
 * @returns {string} Código da família do produto
 */
function extractProductFamily(title = '', context = '') {
  const text = `${title} ${context}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove acentos

  // 1. Cama
  if (/\b(lencol|lencois|percal|jogo de cama|cobre leito|cobreleito|saia box|colcha)\b/.test(text)) {
    return 'cama_lencol';
  }
  if (/\b(travesseiro|travesseiros|fronha|fronhas|toque de pluma|viscoelastico|espuma da nasa)\b/.test(text)) {
    return 'cama_travesseiro';
  }
  if (/\b(edredom|edredons|cobertor|cobertores|manta|mantas|cobredom|sherpa)\b/.test(text)) {
    return 'cama_edredom';
  }

  // 2. Cozinha - Panelas e Preparo Pesado
  if (/\b(panela|panelas|frigideira|frigideiras|cacarola|caldeirao|fervedor|leiteira|wok|cuscuzeira|omeleteira|grill|pressao)\b/.test(text)) {
    return 'cozinha_panelas';
  }

  // 3. Cozinha - Armazenamento e Organização
  if (/\b(pote|potes|hermetico|hermeticos|porta mantimento|porta mantimentos|porta frios|marmita|potes de vidro|com trava)\b/.test(text)) {
    return 'cozinha_armazenamento';
  }

  // 4. Cozinha - Mesa Posta e Talheres
  if (/\b(faqueiro|faqueiros|talheres|talher|aparelho de jantar|jogo de jantar|prato|pratos|tigela|tigelas|bowl|bowls|xicara|xicaras|taca|tacas|copo|copos)\b/.test(text)) {
    return 'cozinha_mesa';
  }

  // 5. Cozinha - Utensílios e Acessórios
  if (/\b(escorredor|porta tempero|porta temperos|espatula|espatulas|concha|conchas|silicone|tabua|tabua de corte|faca chef|facas|afiador|amolador|abridor|ralador|pegador|bambu)\b/.test(text)) {
    return 'cozinha_utensilios';
  }

  // 6. Banho e Higiene
  if (/\b(toalha|toalhas|banhao|banhao|roupao|roupoes|porta shampoo|dispenser|saboneteira|tapete banheiro|lixeira para banheiro|lixeira banheiro|porta escova|sabonete)\b/.test(text)) {
    return 'banho_higiene';
  }

  // 7. Decoração e Casa
  if (/\b(cortina|cortinas|almofada|almofadas|tapete|tapetes|espelho|espelhos|luminaria|luminarias|abajur|aromatizador|difusor|quadro|quadros|vaso|vasos)\b/.test(text)) {
    return 'casa_decoracao';
  }

  // 8. Eletroportáteis
  if (/\b(air fryer|fritadeira|liquidificador|batedeira|cafeteira|sanduicheira|aspirador|ferro de passar|ventilador)\b/.test(text)) {
    return 'eletroportateis';
  }

  // 9. Eletrônicos / Acessórios
  if (/\b(fone|headphone|earbud|bluetooth|carregador|cabo|smartwatch|relogio inteligente|powerbank|caixa de som)\b/.test(text)) {
    return 'eletronicos';
  }

  // 10. Beleza e Cuidados
  if (/\b(secador|prancha|chapinha|escova secadora|aparador|maquina de cortar|barbeador|skincare|serum|hidratante|protetor solar)\b/.test(text)) {
    return 'beleza_cuidados';
  }

  // Fallback: extrai as duas primeiras palavras do título limpo
  const words = text.split(/\s+/).filter((w) => w.length > 3).slice(0, 2);
  return words.length > 0 ? `generico_${words.join('_')}` : 'geral';
}

/**
 * Seleciona um portfólio diversificado de produtos respeitando o limite máximo por família
 * e priorizando os itens com maior score comercial/desconto.
 *
 * @param {Array<Object>} candidates Lista de produtos candidatos
 * @param {Object} [options] Opções de seleção
 * @param {number} [options.maxPerFamily=3] Máximo de produtos por família
 * @param {number} [options.targetTotal=25] Total desejado de produtos
 * @returns {Array<Object>} Lista filtrada e equilibrada
 */
function selectDiversePortfolio(candidates = [], { maxPerFamily = 3, targetTotal = 25 } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  // Ordena prioritariamente por score comercial decrescente
  const sorted = [...candidates].sort((a, b) => {
    const scoreA = Number(a.score ?? 0);
    const scoreB = Number(b.score ?? 0);
    if (scoreB !== scoreA) return scoreB - scoreA;

    const discountA = Number(a.discountPercent ?? a.discount ?? a.priceDiscountRate ?? 0);
    const discountB = Number(b.discountPercent ?? b.discount ?? b.priceDiscountRate ?? 0);
    if (discountB !== discountA) return discountB - discountA;

    const salesA = Number(a.sales ?? a.sold_quantity ?? 0);
    const salesB = Number(b.sales ?? b.sold_quantity ?? 0);
    return salesB - salesA;
  });

  const selected = [];
  const familyCounts = new Map();
  const remaining = [];

  // Passagem 1: Seleciona respeitando o limite rígido por família
  for (const item of sorted) {
    const title = item.title || item.productName || item.name || '';
    const family = extractProductFamily(title, item.keyword || item.category || '');
    const count = familyCounts.get(family) || 0;

    if (count < maxPerFamily && selected.length < targetTotal) {
      familyCounts.set(family, count + 1);
      selected.push({ ...item, productFamily: family });
    } else {
      remaining.push({ ...item, productFamily: family });
    }
  }

  // Passagem 2 (Fallback): Se não atingiu o targetTotal e ainda temos candidatos, preenche com os melhores restantes
  if (selected.length < targetTotal && remaining.length > 0) {
    for (const item of remaining) {
      if (selected.length >= targetTotal) break;
      selected.push(item);
    }
  }

  return selected;
}

module.exports = {
  extractProductFamily,
  selectDiversePortfolio,
};
