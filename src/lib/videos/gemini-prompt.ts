export type GeminiPromptOffer = {
  product_name: string;
  current_price: number | string;
  old_price?: number | string | null;
  platform?: string | null;
  category?: string | null;
  shipping_free?: boolean | null;
  coupon?: string | null;
  original_url?: string | null;
  short_name?: string | null;
};

// --- FUNÇÕES DE PREÇO POR EXTENSO ---
function numeroPorExtenso(num: number): string {
  if (num === 0) return 'zero';
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  if (num < 20) return unidades[num];
  if (num < 100) return dezenas[Math.floor(num / 10)] + (num % 10 !== 0 ? ' e ' + unidades[num % 10] : '');
  if (num === 100) return 'cem';
  if (num < 1000) return centenas[Math.floor(num / 100)] + (num % 100 !== 0 ? ' e ' + numeroPorExtenso(num % 100) : '');
  if (num < 1000000) return (num >= 1000 && num < 2000 ? 'mil' : numeroPorExtenso(Math.floor(num / 1000)) + ' mil') + (num % 1000 !== 0 ? (num % 1000 < 100 || (num % 1000) % 100 === 0 ? ' e ' : ' ') + numeroPorExtenso(num % 1000) : '');
  return num.toString();
}

function precoPorExtenso(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "preço não informado";
  const num = Number(valor);
  if (!Number.isFinite(num)) return String(valor);

  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);
  
  let extenso = '';
  if (reais > 0) extenso += numeroPorExtenso(reais) + (reais === 1 ? ' real' : ' reais');
  if (centavos > 0) extenso += (reais > 0 ? ' e ' : '') + numeroPorExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
  
  return extenso || 'zero reais';
}
// ------------------------------------

// 1. INTERAÇÃO DINÂMICA DA AVATAR COM O PRODUTO (por categoria)
function productInteraction(offer: GeminiPromptOffer): string {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();

  if (/(cadeira|poltrona|sofa|sofá|banco\s*gamer)/i.test(searchable)) {
    return `sentada confortavelmente no produto da imagem de referência, mantendo perfeitamente seu design e cores originais. O produto está apoiado no chão do estúdio`;
  }
  if (/(tênis|tenis|calçado|calcado|sapato|sandalia|bota)/i.test(searchable)) {
    return `ao lado do produto da imagem de referência, exibido sobre um expositor minimalista ao chão`;
  }
  if (/(celular|smartphone|controle|gamepad|headset|fone|notebook|tablet)/i.test(searchable)) {
    return `segurando o produto da imagem de referência com as mãos, exibindo-o para a câmera, mantendo perfeitamente seu design e cores originais`;
  }
  if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer)/i.test(searchable)) {
    return `ao lado do produto da imagem de referência sobre uma bancada, com a mão gesticulando em direção a ele`;
  }
  if (/(shampoo|máscara|kit|beleza|maquiagem|perfume|creme|cabelo|pele)/i.test(searchable)) {
    return `segurando o produto da imagem de referência com as mãos, exibindo-o para a câmera`;
  }
  return `ao lado do produto da imagem de referência, gestualizando em direção a ele`;
}

// 2. ESTÚDIO TEMÁTICO DINÂMICO (por categoria)
function studioBackground(offer: GeminiPromptOffer): string {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();

  if (/(roteador|celular|smartphone|notebook|pc|gamer|wi-fi|tecnologia|eletrônico|controle|gamepad|headset|cadeira\s*gamer)/i.test(searchable)) {
    return `estúdio escuro com luzes suaves de neon azul e roxo, estética gamer premium`;
  }
  if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer|cozinha)/i.test(searchable)) {
    return `estúdio com bancada de cozinha moderna, luz quente e aconchegante, tons de madeira e metal escovado`;
  }
  if (/(shampoo|máscara|kit|beleza|maquiagem|cabelo|pele)/i.test(searchable)) {
    return `estúdio clean com tons rosados e dourados suaves, iluminação difusa de spa premium`;
  }
  if (/(tênis|tenis|roupa|moda|vestuário|calcado|calçado|sapato|sandalia|bota)/i.test(searchable)) {
    return `estúdio esportivo premium com paredes escuras e detalhes de luz neon laranja e cinza`;
  }
  return `estúdio escuro com iluminação volumétrica suave e elegante, estética publicitária premium`;
}

// 3. GERAÇÃO DINÂMICA DA FALA
function speechScript(offer: GeminiPromptOffer) {
  const marketplace = offer.platform ? ` na ${offer.platform}` : "";
  const extenso = precoPorExtenso(offer.current_price);
  
  const prefix = `"Olha este achado${marketplace}! Este é o `;
  const suffix = `. Só ${extenso}. Os detalhes estão na publicação!"`;
  
  const shortName = offer.short_name ? offer.short_name.trim() : offer.product_name;
  
  return `${prefix}${shortName}${suffix}`;
}

// 4. MONTAGEM DO PROMPT MESTRE (formato fluido validado no Google Flow)
export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  return `Plano médio da exata mesma mulher da imagem Avatar_Silvia. Preserve rigorosamente sua identidade facial, pele morena, cabelo escuro liso na altura dos ombros, a camiseta azul-marinho e a calça jeans escura. Ela está ${productInteraction(offer)}. Ela fala diretamente para a câmera com expressão entusiasmada e natural, com leves acenos de cabeça e gestos suaves com as mãos. O fundo é um ${studioBackground(offer)}. Câmera fixa em plano médio sem cortes, sem zoom. Fotorrealista em 4K. Vídeo completamente limpo sem texto, número, legenda ou marca d'água na tela. Lipsync: ${speechScript(offer)}`;
}
