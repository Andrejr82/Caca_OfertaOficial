'use strict';

/**
 * Commercial Price Competitiveness & Quantity Normalization — Caça Ofertas Oficial
 *
 * Responsabilidades:
 * 1. Extração determinística de quantidade, volume e unidades a partir do título do produto.
 * 2. Normalização de preço (R$/L, R$/kg, R$/unidade).
 * 3. Identificação de famílias comerciais equivalentes dentro do mesmo run.
 * 4. Avaliação de competitividade relativa de preço entre pares concorrentes.
 */

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Verifica se o título do produto corresponde a um item durável, eletrônico, eletrodoméstico,
 * veículo, móvel, ferramenta, vestuário ou hardware onde especificações de peso/volume não representam
 * quantidade comercial de venda (ex: 150kg de suporte em bicicleta, 64g de memória em console, 5G de rede em celular).
 */
function isDurableOrTechnicalProduct(normalizedTitle = '') {
  if (!normalizedTitle) return false;

  const DURABLE_PATTERNS = [
    // Smartphones, celulares, telefonia, wearables
    /\b(?:smartphones?|celulares?|telefones?|iphones?|galaxy|motorola|moto\s+[ge]|xiaomi|redmi|poco|realme|infinix|smartwatch(?:es)?|relogios?|smartbands?|tablets?|ipads?)\b/,
    // Áudio, vídeo, fotografia, câmeras, segurança eletrônica
    /\b(?:cameras?|cam\b|camer\b|dvr|nvr|gopro|webcams?|tv\b|smart\s*tv|televisao|televisoes|televisores?|monitores?|displays?|telas?|fones?|headsets?|headphones?|earphones?|airdots?|airpods?|caixa\s+de\s+som|soundbars?|speakers?|alexa|echo)\b/,
    // Games, consoles, periféricos
    /\b(?:consoles?|video\s*games?|videogames?|r36s|game\s*sticks?|nintendo|playstation|ps[1-5]\b|xbox|gamers?|joysticks?|gamepads?|controles?)\b/,
    // Computadores, hardware, TI, escritório durável
    /\b(?:notebooks?|laptops?|computadores?|pc\s+gamer|placas?\s+de\s+video|placas?\s+mae|gpus?|cpus?|processadores?|memorias?\s+ram|ssd\b|hd\s+externo|pendrives?|pen\s+drives?|mouses?|teclados?|gabinetes?|fontes?\s+atx|roteadores?|repetidores?|modems?|switches?|impressoras?|multifuncionais?|projetores?|scanners?|drones?|carregadores?|cabos?\s+(?:usb|hdmi|tipo\s*c)|adaptadores?|rtx|gtx|radeon|geforce)\b/,
    // Eletrodomésticos e eletroportáteis
    /\b(?:geladeiras?|refrigeradores?|freezers?|fogoes?|fogao|cooktops?|fornos?|microondas|micro\s+ondas|air\s*fryers?|fritadeiras?|liquidificadores?|batedeiras?|cafeteiras?|sanduicheiras?|grills?|espremedores?|ventiladores?|circuladores?|ar\s+condicionados?|climatizadores?|aquecedores?|aspiradores?|robo\s+aspirador|ferros?\s+de\s+passar|vaporizadores?|maquinas?\s+de\s+lavar|lava\s+e\s+seca|tanquinhos?|depuradores?|coifas?)\b/,
    // Veículos, mobilidade, esportes duráveis e fitness
    /\b(?:bicicletas?|bikes?|ergometricas?|spinning|patinetes?|scooters?|skates?|esteiras?|halteres?|anilhas?|barras?\s+de\s+musculacao|bancos?\s+supino|estacoes?\s+de\s+musculacao|capacetes?|pneus?|rodas?|amortecedores?)\b/,
    // Móveis, louças sanitárias e decoração durável
    /\b(?:cadeiras?|poltronas?|sofas?|mesas?|escrivaninhas?|armarios?|guarda\s+roupas?|estantes?|racks?|paineis?|camas?|colchoes?|colchao|vasos?\s+sanitarios?|privadas?|pias?|cubas?|torneiras?|chuveiros?|espelhos?|luminarias?|lustres?|abajures?)\b/,
    // Ferramentas duráveis
    /\b(?:furadeiras?|parafusadeiras?|esmerilhadeiras?|serras?|trenas?|maletas?\s+de\s+ferramentas?|jogos?\s+de\s+ferramentas?|alicates?|chaves?\s+de\s+fenda)\b/,
    // Vestuário e calçados
    /\b(?:tenis\b|sapatos?|botas?|sandalias?|chinelos?|camisas?|camisetas?|regatas?|blusas?|calcas?|bermudas?|shorts?|vestidos?|saias?|jaquetas?|casacos?|moletons?|moletom|cuecas?|calcinhas?|sutias?|sutia|meias?|bones?|mochilas?|bolsas?|carteiras?|oculos)\b/,
    // Brinquedos duráveis
    /\b(?:bonecas?|carrinhos?|legos?|blocos?\s+de\s+montar|quebra\s+cabecas?)\b/
  ];

  return DURABLE_PATTERNS.some((pattern) => pattern.test(normalizedTitle));
}

/**
 * Verifica se o produto pertence a categorias ou nichos consumíveis / conteúdo físico factual (L/kg/ml/g).
 */
function isConsumableOrContentProduct(normalizedTitle = '') {
  if (!normalizedTitle) return false;

  const CONSUMABLE_PATTERNS = [
    // Limpeza e cuidados domésticos
    /\b(?:sabaos?|sabao|detergentes?|amaciantes?|desinfetantes?|aguas?\s+sanitarias?|alvejantes?|multiusos?|limpadores?|lustra\s+moveis|limpa\s+vidros|soda\s+caustica|cloro|tira\s+manchas|vanish|omo|ariel|ype|downy|comfort|veja|cif|ajax|urca|girando\s+sol|minuano|brilhante|limpol)\b/,
    // Alimentos, bebidas e suplementos
    /\b(?:cafes?|cafe|arroz|feijao|acucar|oleos?|azeites?|farinhas?|leites?|chocolates?|cacau|bombons?|biscoitos?|bolachas?|massas?|macarrao|temperos?|sal\b|pimentas?|molhos?|maioneses?|ketchups?|mostardas?|refrigerantes?|sucos?|cervejas?|vinhos?|energeticos?|whisky|vodka|whey|creatinas?|bcaa|glutaminas?|albuminas?|proteinas?|suplementos?|colagenos?|vitaminas?|mel\b|granolas?|aveias?|castanhas?|amendoim|balas?|pirulitos?|chicletes?|doces?|leite\s+condensado|creme\s+de\s+leite|leite\s+de\s+coco)\b/,
    // Higiene, beleza e cosméticos
    /\b(?:shampoos?|xampus?|condicionadores?|sabonetes?|hidratantes?|cremes?|locoes?|locao|seruns?|serum|protetores?\s+solares?|bloqueadores?|oleos?\s+corporais?|perfumes?|colonias?|body\s+splash|desodorantes?|antitranspirantes?|pastas?\s+de\s+dente|cremes?\s+dentais?|enxaguantes?|mascaras?\s+capilares?|tinturas?|tonalizantes?|esmaltes?|acetonas?|algodao|ceras?\s+depilatorias?|pomadas?\s+capilares?|reparadores?\s+de\s+pontas|manteigas?\s+corporais?|principia|cerave|la\s+roche|vichy|nivea|dove|sallve|tracta|darrow|eucerin|boticario|natura|avon|elseve|pantene|head\s*(?:&|e)\s*shoulders|loreal)\b/,
    // Pet consumível
    /\b(?:racoes?|racao|areias?|areia\s+sanitaria|granulados?|petiscos?|bifinhos?|saches?|sache|pates?|pate|tapetes?\s+higienicos?|catbio|pipicat|whiskas|pedigree|premier|golden|purina|royal\s+canin|chocat|fino\s+trato)\b/,
    // Insumos por peso/volume
    /\b(?:adubos?|fertilizantes?|substratos?|terras?\s+vegetais?|sementes?|massas?\s+corridas?|argamassas?|gessos?|rejuntes?|tintas?|vernizes?|resinas?|silicones?|colas?|solventes?|tiner|aguarras|impermeabilizantes?|lubrificantes?|graxas?)\b/
  ];

  return CONSUMABLE_PATTERNS.some((pattern) => pattern.test(normalizedTitle));
}

/**
 * Extrai quantidade de kits / multi-unidades (ex: Kit 2, Kit com 3, KIT2, 10 unidades, 2 peças).
 */
function extractKitOrMultiUnit(normalizedTitle = '') {
  if (!normalizedTitle) return null;

  // Kit Duo, Kit Trio
  if (/\bkit\s*duo\b/.test(normalizedTitle)) {
    return { unit: 'unit', quantity: 2, rawUnit: 'kit' };
  }
  if (/\bkit\s*trio\b/.test(normalizedTitle)) {
    return { unit: 'unit', quantity: 3, rawUnit: 'kit' };
  }

  // Kit com 3, Kit c/ 2, Kit de 4, Kit 2, Kit 3, Kit 10, Pack 3, Combo 2, Conjunto 4
  const kitMatch = normalizedTitle.match(/\b(?:kit|combo|pack|conjunto)\s*(?:com|de|c\/)?\s*(\d{1,4})\b/);
  if (kitMatch) {
    const count = parseInt(kitMatch[1], 10);
    if (count >= 2 && count <= 500) {
      return { unit: 'unit', quantity: count, rawUnit: 'kit' };
    }
  }

  // KIT2, KIT3, KIT4, etc.
  const kitDirectMatch = normalizedTitle.match(/\bkit(\d{1,3})\b/);
  if (kitDirectMatch) {
    const count = parseInt(kitDirectMatch[1], 10);
    if (count >= 2 && count <= 500) {
      return { unit: 'unit', quantity: count, rawUnit: 'kit' };
    }
  }

  // Multiplicadores explícitos: 2x, 3x, 4x seguidos de un, pecas, pares, itens
  const multUnitMatch = normalizedTitle.match(/\b(\d{1,3})\s*x\s*(\d+(?:[.,]\d+)?)\s*(?:unidades?|unids?|un|pecas?|peca|pares?|par|itens|item)\b/);
  if (multUnitMatch) {
    const count = parseInt(multUnitMatch[1], 10);
    const subAmount = parseNumber(multUnitMatch[2], 0);
    if (count > 0 && subAmount > 0) {
      return { unit: 'unit', quantity: count * subAmount, rawUnit: 'unit' };
    }
  }

  // 10 unidades, 2 peças, 5 pares, 3 un
  const unitMatch = normalizedTitle.match(/\b(\d{1,4})\s*(?:unidades?|unids?|un|pecas?|peca|pares?|par|itens|item)\b/);
  if (unitMatch) {
    const count = parseInt(unitMatch[1], 10);
    if (count >= 2 && count <= 500) {
      return { unit: 'unit', quantity: count, rawUnit: 'unit' };
    }
  }

  return null;
}

/**
 * Extrai unidade e quantidade normalizadas a partir do título do produto.
 * Regra: Normalização física (L/kg) SOMENTE quando a unidade representar CONTEÚDO COMERCIAL do produto.
 * Para duráveis/eletrônicos, especificações físicas/técnicas nunca geram kg/L.
 * Retorna: { unit: 'L' | 'kg' | 'unit', quantity: number, rawUnit: string | null }
 */
function extractProductUnitAndQuantity(title = '') {
  const normalized = normalizeText(title);
  if (!normalized) return { unit: 'unit', quantity: 1, rawUnit: null };

  const kitInfo = extractKitOrMultiUnit(normalized);

  // 1. Produtos duráveis / técnicos / hardware / eletrodomésticos / veículos / móveis / ferramentas / vestuário
  // Normalização física (L/kg) NUNCA se aplica a duráveis.
  if (isDurableOrTechnicalProduct(normalized)) {
    if (kitInfo) {
      return kitInfo;
    }
    return { unit: 'unit', quantity: 1, rawUnit: null };
  }

  // 2. Apenas produtos comprovadamente consumíveis ou conteúdo físico factual podem ser normalizados por L/kg
  const isConsumable = isConsumableOrContentProduct(normalized);

  if (isConsumable) {
    // 2.1 Multiplicadores compostos de consumíveis (ex: 2x 5L, 3x 500ml, 2x 1kg, 4x 500g)
    const multMatch = normalized.match(/\b(\d{1,3})\s*x\s*(\d+(?:[.,]\d+)?)\s*(l|litros?|lt|lts|ml|mls|kg|quilos?|kilos?|g|gr|gramas?)\b/);
    if (multMatch) {
      const count = parseInt(multMatch[1], 10);
      const subAmount = parseNumber(multMatch[2], 0);
      const rawUnit = multMatch[3];

      if (count > 0 && subAmount > 0) {
        if (/^(?:l|litros?|lt|lts)$/.test(rawUnit)) {
          return { unit: 'L', quantity: count * subAmount, rawUnit: 'L' };
        }
        if (/^(?:ml|mls)$/.test(rawUnit)) {
          return { unit: 'L', quantity: (count * subAmount) / 1000, rawUnit: 'ml' };
        }
        if (/^(?:kg|quilos?|kilos?)$/.test(rawUnit)) {
          return { unit: 'kg', quantity: count * subAmount, rawUnit: 'kg' };
        }
        if (/^(?:g|gr|gramas?)$/.test(rawUnit)) {
          return { unit: 'kg', quantity: (count * subAmount) / 1000, rawUnit: 'g' };
        }
      }
    }

    // 2.2 Volume em Litros (L, litros, lt)
    const literMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:l|litros?|lt|lts)\b/);
    if (literMatch) {
      const qty = parseNumber(literMatch[1], null);
      if (qty !== null && qty > 0) {
        return { unit: 'L', quantity: qty, rawUnit: 'L' };
      }
    }

    // 2.3 Volume em Mililitros (ml, mls)
    const mlMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:ml|mls)\b/);
    if (mlMatch) {
      const ml = parseNumber(mlMatch[1], null);
      if (ml !== null && ml > 0) {
        return { unit: 'L', quantity: ml / 1000, rawUnit: 'ml' };
      }
    }

    // 2.4 Peso em Quilos (kg, quilos, kilos) - ignorando especificações de suporte de peso
    const isWeightLimit = /\b(?:ate|suporta|suportando|capacidade(?:\s+de)?|carga(?:\s+maxima)?|peso\s+maximo|maximo|max|suportado)\s*(\d+(?:[.,]\d+)?)\s*kg\b/.test(normalized);
    if (!isWeightLimit) {
      const kgMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?|kilos?)\b/);
      if (kgMatch) {
        const qty = parseNumber(kgMatch[1], null);
        if (qty !== null && qty > 0) {
          return { unit: 'kg', quantity: qty, rawUnit: 'kg' };
        }
      }
    }

    // 2.5 Peso em Gramas (g, gr, gramas) - ignorando 5g/4g/2.4g/64g de especificações técnicas
    const isNetworkOrTechFrequency = /\b(?:2\.4|5\.8|[2-5])\s*g\b/.test(normalized);
    const isTechStorage = /\b(?:8|16|32|64|128|256|512)\s*g\b/.test(normalized) && !/\b(?:chocolate|bombom|creatina|cafe|tempero|sache|petisco|racao|whey|bcaa)\b/.test(normalized);
    if (!isNetworkOrTechFrequency && !isTechStorage) {
      const gMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)\b/);
      if (gMatch) {
        const g = parseNumber(gMatch[1], null);
        if (g !== null && g > 0) {
          return { unit: 'kg', quantity: g / 1000, rawUnit: 'g' };
        }
      }
    }
  }

  // 3. Se houver kit/multi-unidade (mesmo em consumíveis sem volume especificado)
  if (kitInfo) {
    return kitInfo;
  }

  // 4. Fallback padrão: 1 unidade
  return { unit: 'unit', quantity: 1, rawUnit: null };
}

/**
 * Calcula o preço normalizado por unidade padrão (R$/L, R$/kg ou R$/unidade).
 */
function calculateNormalizedPrice(priceValue, unitInfo = null) {
  const price = parseNumber(priceValue, null);
  if (price === null || price <= 0) {
    return {
      normalized_price: null,
      normalized_unit: null,
      normalized_quantity: null,
    };
  }

  const unit = unitInfo?.unit || 'unit';
  const quantity = unitInfo?.quantity || 1;

  if (unit && quantity && quantity > 0) {
    const normalizedPrice = Math.round((price / quantity) * 100) / 100;
    return {
      normalized_price: normalizedPrice,
      normalized_unit: unit,
      normalized_quantity: quantity,
    };
  }

  return {
    normalized_price: price,
    normalized_unit: 'unit',
    normalized_quantity: 1,
  };
}

const STOP_WORDS_FAMILY = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'e', 'em', 'a', 'o', 'as', 'os',
  'um', 'uma', 'por', 'na', 'no', 'se', 'ao', 'sem', 'mais', 'menos', 'novo', 'nova',
  'promocao', 'oferta', 'frete', 'gratis', 'original', 'oficial', 'desconto', 'barato',
  'qualidade', 'super', 'alta', 'plus', 'pro', 'max', 'ultra', 'refil', 'galao', 'garrafa',
  'liquido', 'liquida', 'po', 'em', 'frasco', 'pacote', 'embalagem', 'leve', 'pague',
  'kit', 'combo', 'pack', 'conjunto', 'unidades', 'unidade', 'pecas', 'peca', 'pares', 'par'
]);

/**
 * Extrai a chave de família comercial determinística para comparação de preços equivalentes.
 */
function extractCompetitivenessFamilyKey(candidate = {}) {
  const title = candidate.productName || candidate.product_term || candidate.title || '';
  const normalized = normalizeText(title);
  if (!normalized) return 'unknown:unknown';

  // Marcas/linhas comerciais conhecidas com produtos equivalentes frequentes
  const BRANDS_PATTERNS = [
    { brand: 'omo', pattern: /\bomo\b/ },
    { brand: 'ariel', pattern: /\bariel\b/ },
    { brand: 'downy', pattern: /\bdowny\b/ },
    { brand: 'comfort', pattern: /\bcomfort\b/ },
    { brand: 'ypê', pattern: /\b(ype|ype)\b/ },
    { brand: 'dove', pattern: /\bdove\b/ },
    { brand: 'nivea', pattern: /\bnivea\b/ },
    { brand: 'red-bull', pattern: /\bred\s*bull\b/ },
    { brand: 'monster', pattern: /\bmonster\b/ },
    { brand: 'nespresso', pattern: /\bnespresso\b/ },
    { brand: 'dolce-gusto', pattern: /\bdolce\s*gusto\b/ },
    { brand: '3coracoes', pattern: /\b(3\s*coracoes|tres\s*coracoes)\b/ },
    { brand: 'pampers', pattern: /\bpampers\b/ },
    { brand: 'huggies', pattern: /\bhuggies\b/ },
    { brand: 'head-shoulders', pattern: /\bhead\s*(?:&|e)\s*shoulders\b/ },
    { brand: 'pantene', pattern: /\bpantene\b/ },
    { brand: 'elseve', pattern: /\belseve\b/ },
    { brand: 'cremer', pattern: /\bcremer\b/ },
  ];

  for (const { brand, pattern } of BRANDS_PATTERNS) {
    if (pattern.test(normalized)) {
      // Extrai a linha ou sub-produto específico (ex: lavagem perfeita, lavanda, concentrado, etc.)
      const words = normalized.split(/\s+/).filter((w) => {
        if (STOP_WORDS_FAMILY.has(w)) return false;
        if (/^\d+(?:[.,]\d+)?(?:l|ml|kg|g|un)?$/.test(w)) return false;
        if (/^\d+$/.test(w)) return false;
        return true;
      });

      const coreWords = words.filter((w) => !pattern.test(w)).slice(0, 3);
      const subKey = coreWords.length ? coreWords.join('-') : 'geral';
      return `family:${brand}:${subKey}`;
    }
  }

  // Para produtos genéricos / tech / acessórios: extrai tokens essenciais sem ruído
  const tokens = normalized.split(/\s+/).filter((w) => {
    if (STOP_WORDS_FAMILY.has(w)) return false;
    if (/^\d+(?:[.,]\d+)?(?:l|ml|kg|g|un)?$/.test(w)) return false;
    if (/^\d+$/.test(w)) return false;
    return w.length >= 3;
  });

  if (tokens.length >= 2) {
    return `family:${tokens.slice(0, 3).join('-')}`;
  }

  return `family:${tokens[0] || 'geral'}`;
}

/**
 * Avalia se dois candidatos possuem unidades compatíveis para comparação direta de preço.
 * L somente compara com L.
 * kg somente compara com kg.
 * unit somente compara com unit.
 * NUNCA comparar R$/L diretamente com R$/kg.
 */
function areUnitsComparable(unitA, unitB) {
  if (!unitA || !unitB) return false;
  return unitA === unitB;
}

/**
 * Avalia a competitividade de preço de um candidato em relação a seus concorrentes (peers) no mesmo run.
 */
function evaluatePeerPriceCompetitiveness(candidate = {}, peers = []) {
  const price = parseNumber(candidate.currentPrice ?? candidate.price, null);
  const discount = Math.max(0, parseNumber(candidate.discountPercent ?? candidate.priceDiscountRate, 0));

  if (price === null || price <= 0) {
    return {
      score: 0,
      family_key: 'unknown',
      normalized_unit: null,
      normalized_price: null,
      peer_count: 0,
      relative_price_position: 'unfavorable',
      competitiveness_reason: 'Preço inválido ou ausente',
    };
  }

  const title = candidate.productName || candidate.product_term || candidate.title || '';
  const unitInfo = extractProductUnitAndQuantity(title);
  const priceNorm = calculateNormalizedPrice(price, unitInfo);
  const familyKey = extractCompetitivenessFamilyKey(candidate);

  // Filtra todos os pares da mesma família no run
  const sameFamilyPeers = Array.isArray(peers) ? peers.filter((p) => {
    const peerPrice = parseNumber(p.currentPrice ?? p.price, null);
    if (peerPrice === null || peerPrice <= 0) return false;
    const peerKey = extractCompetitivenessFamilyKey(p);
    return peerKey === familyKey;
  }) : [];

  // Filtra pares da mesma família com unidades estritamente compatíveis (L com L, kg com kg, unit com unit)
  const comparablePeers = sameFamilyPeers.filter((p) => {
    const peerTitle = p.productName || p.product_term || p.title || '';
    const peerUnitInfo = extractProductUnitAndQuantity(peerTitle);
    const peerNorm = calculateNormalizedPrice(parseNumber(p.currentPrice ?? p.price, 0), peerUnitInfo);
    return areUnitsComparable(priceNorm.normalized_unit, peerNorm.normalized_unit);
  });

  const peerCount = Math.max(1, comparablePeers.length);

  // Caso 1: Sem concorrentes comparáveis no run (peer_count === 1 ou unidades incompatíveis)
  if (comparablePeers.length <= 1) {
    let score = 1;
    if (discount >= 50) score = 10;
    else if (discount >= 35) score = 8;
    else if (discount >= 20) score = 6;
    else if (discount >= 10) score = 4;
    else if (discount > 0) score = 2;

    const isUnitNotComparable = sameFamilyPeers.length > 1;
    const relativePosition = isUnitNotComparable ? 'unit_not_comparable' : 'solo';

    let reason = '';
    if (isUnitNotComparable) {
      reason = discount >= 20
        ? `Unidades incompatíveis para comparação direta na família; desconto de ${Math.round(discount)}% considerado`
        : (discount > 0 ? `Unidades incompatíveis na família; desconto de ${Math.round(discount)}%` : 'Unidades incompatíveis para comparação direta de preço na família');
    } else {
      reason = discount >= 20
        ? `Desconto promocional expressivo de ${Math.round(discount)}%`
        : (discount > 0 ? `Desconto de ${Math.round(discount)}%` : 'Preço comercial regular');
    }

    return {
      score,
      family_key: familyKey,
      normalized_unit: priceNorm.normalized_unit,
      normalized_price: priceNorm.normalized_price,
      peer_count: 1,
      relative_price_position: relativePosition,
      competitiveness_reason: reason,
    };
  }

  // Caso 2: Existem concorrentes comparáveis da mesma família com a MESMA unidade (L vs L, kg vs kg, unit vs unit)
  const peerNormalizedPrices = comparablePeers.map((p) => {
    const peerPrice = parseNumber(p.currentPrice ?? p.price, 0);
    const peerTitle = p.productName || p.product_term || p.title || '';
    const peerUnitInfo = extractProductUnitAndQuantity(peerTitle);
    return calculateNormalizedPrice(peerPrice, peerUnitInfo).normalized_price;
  }).filter((p) => p !== null && p > 0);

  const minPeerPrice = Math.min(...peerNormalizedPrices);
  const myNormPrice = priceNorm.normalized_price;

  const ratio = myNormPrice / minPeerPrice;
  const unitLabel = priceNorm.normalized_unit === 'unit' ? 'un' : (priceNorm.normalized_unit || 'un');

  let score = 1;
  let relativePosition = 'unfavorable';
  let reason = '';

  if (ratio <= 1.02) {
    // Melhor preço relativo da família
    score = 10;
    relativePosition = 'best_in_family';
    reason = `Melhor preço relativo da família (R$ ${myNormPrice.toFixed(2)}/${unitLabel} vs mín R$ ${minPeerPrice.toFixed(2)})`;
  } else if (ratio <= 1.15) {
    // Até 15% acima do mínimo -> altamente competitivo
    score = discount >= 20 ? 8 : 7;
    relativePosition = 'competitive';
    reason = `Preço competitivo na família (+${Math.round((ratio - 1) * 100)}% do mínimo R$ ${minPeerPrice.toFixed(2)}/${unitLabel})`;
  } else if (ratio <= 1.35) {
    // Até 35% acima do mínimo -> intermediário
    score = discount >= 20 ? 5 : 4;
    relativePosition = 'average';
    reason = `Preço intermediário na família (+${Math.round((ratio - 1) * 100)}% do mínimo R$ ${minPeerPrice.toFixed(2)}/${unitLabel})`;
  } else {
    // Claramente mais caro que os concorrentes da mesma família -> penalidade (score 1)
    score = 1;
    relativePosition = 'unfavorable';
    reason = `Preço desfavorável em relação aos pares da família (R$ ${myNormPrice.toFixed(2)}/${unitLabel} vs mín R$ ${minPeerPrice.toFixed(2)})`;
  }

  return {
    score,
    family_key: familyKey,
    normalized_unit: priceNorm.normalized_unit,
    normalized_price: priceNorm.normalized_price,
    peer_count: peerCount,
    relative_price_position: relativePosition,
    competitiveness_reason: reason,
  };
}

module.exports = {
  isDurableOrTechnicalProduct,
  isConsumableOrContentProduct,
  extractKitOrMultiUnit,
  extractProductUnitAndQuantity,
  calculateNormalizedPrice,
  extractCompetitivenessFamilyKey,
  areUnitsComparable,
  evaluatePeerPriceCompetitiveness,
};
