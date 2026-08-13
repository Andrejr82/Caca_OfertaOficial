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

const VIDEO_DURATION_SECONDS = 8;
const MAX_SPEECH_WORDS = 22;
const PRODUCT_NAME_WORD_LIMITS = [8, 6, 4];

// --- FUNÇÕES DE PREÇO POR EXTENSO ---
function numeroPorExtenso(num: number): string {
  if (num === 0) return "zero";
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (num < 20) return unidades[num];
  if (num < 100) return dezenas[Math.floor(num / 10)] + (num % 10 !== 0 ? " e " + unidades[num % 10] : "");
  if (num === 100) return "cem";
  if (num < 1000) return centenas[Math.floor(num / 100)] + (num % 100 !== 0 ? " e " + numeroPorExtenso(num % 100) : "");
  if (num < 1000000) {
    return (num >= 1000 && num < 2000 ? "mil" : numeroPorExtenso(Math.floor(num / 1000)) + " mil")
      + (num % 1000 !== 0 ? (num % 1000 < 100 || (num % 1000) % 100 === 0 ? " e " : " ") + numeroPorExtenso(num % 1000) : "");
  }
  return num.toString();
}

function precoPorExtenso(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "preço não informado";
  const num = Number(valor);
  if (!Number.isFinite(num)) return String(valor);

  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);

  let extenso = "";
  if (reais > 0) extenso += numeroPorExtenso(reais) + (reais === 1 ? " real" : " reais");
  if (centavos > 0) extenso += (reais > 0 ? " e " : "") + numeroPorExtenso(centavos) + (centavos === 1 ? " centavo" : " centavos");

  return extenso || "zero reais";
}

function precoFalavelCurto(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "preço especial";
  const num = Number(valor);
  if (!Number.isFinite(num)) return String(valor);

  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);
  const reaisTexto = numeroPorExtenso(reais);

  if (!centavos) return `${reaisTexto} reais`;
  return `${reaisTexto} e ${numeroPorExtenso(centavos)}`;
}
// ------------------------------------

function getSpeakableProductName(offer: GeminiPromptOffer): string {
  const source = offer.short_name?.trim() || offer.product_name.trim();

  return source
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s*[-–—]\s*(?:127|220)\s*v\b/gi, " ")
    .replace(/\b(?:127|220)\s*v\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—,:;]\s*$/g, "")
    .trim();
}

function compactProductName(name: string, maxWords: number): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return name;
  return words.slice(0, maxWords).join(" ").replace(/[,:;\-–—]+$/g, "");
}

function wordCount(text: string): number {
  return text
    .replace(/[“”"!,.!?;:]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// 1. INTERAÇÃO DINÂMICA DA AVATAR COM O PRODUTO (por categoria)
function productInteraction(offer: GeminiPromptOffer): string {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();

  if (/(cadeira|poltrona|sofa|sofá|banco\s*gamer)/i.test(searchable)) {
    return "sentada confortavelmente no produto da imagem de referência, mantendo perfeitamente seu design e cores originais. O produto está apoiado no chão do estúdio";
  }
  if (/(tênis|tenis|calçado|calcado|sapato|sandalia|bota)/i.test(searchable)) {
    return "ao lado do produto da imagem de referência, exibido sobre um expositor minimalista ao chão";
  }
  if (/(celular|smartphone|controle|gamepad|headset|fone|notebook|tablet)/i.test(searchable)) {
    return "segurando o produto da imagem de referência com as mãos, exibindo-o para a câmera, mantendo perfeitamente seu design e cores originais";
  }
  if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer)/i.test(searchable)) {
    return "ao lado do produto da imagem de referência sobre uma bancada, com a mão gesticulando em direção a ele";
  }
  if (/(shampoo|máscara|kit|beleza|maquiagem|perfume|creme|cabelo|pele)/i.test(searchable)) {
    return "segurando o produto da imagem de referência com as mãos, exibindo-o para a câmera";
  }
  return "ao lado do produto da imagem de referência, gesticulando em direção a ele";
}

// 2. ESTÚDIO TEMÁTICO DINÂMICO (por categoria)
function studioBackground(offer: GeminiPromptOffer): string {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();

  if (/(roteador|celular|smartphone|notebook|pc|gamer|wi-fi|tecnologia|eletrônico|controle|gamepad|headset|cadeira\s*gamer)/i.test(searchable)) {
    return "estúdio escuro com luzes suaves de neon azul e roxo, estética gamer premium";
  }
  if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer|cozinha)/i.test(searchable)) {
    return "estúdio com bancada de cozinha moderna, luz quente e aconchegante, tons de madeira e metal escovado";
  }
  if (/(shampoo|máscara|kit|beleza|maquiagem|cabelo|pele)/i.test(searchable)) {
    return "estúdio clean com tons rosados e dourados suaves, iluminação difusa de spa premium";
  }
  if (/(tênis|tenis|roupa|moda|vestuário|calcado|calçado|sapato|sandalia|bota)/i.test(searchable)) {
    return "estúdio esportivo premium com paredes escuras e detalhes de luz neon laranja e cinza";
  }
  return "estúdio escuro com iluminação volumétrica suave e elegante, estética publicitária premium";
}

// 3. GERAÇÃO DINÂMICA DA FALA PARA VÍDEOS DE 8 SEGUNDOS
function speechScript8Seconds(offer: GeminiPromptOffer): string {
  const baseProductName = getSpeakableProductName(offer);
  const price = precoFalavelCurto(offer.current_price);

  for (const maxProductWords of PRODUCT_NAME_WORD_LIMITS) {
    const productName = compactProductName(baseProductName, maxProductWords);
    const full = `Olha esse achado! ${productName}, por ${price}. Confira na publicação!`;
    if (wordCount(full) <= MAX_SPEECH_WORDS) return `"${full}"`;

    const compact = `${productName}, por ${price}. Confira na publicação!`;
    if (wordCount(compact) <= MAX_SPEECH_WORDS) return `"${compact}"`;
  }

  const minimumProductName = compactProductName(baseProductName, 3);
  return `"${minimumProductName}, por ${price}. Confira!"`;
}

// Mantida para futuros presets mais longos e outros usos de locução.
export function formatLongPriceForSpeech(valor: number | string | null | undefined): string {
  return precoPorExtenso(valor);
}

// 4. MONTAGEM DO PROMPT MESTRE
export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  const interaction = productInteraction(offer);
  const background = studioBackground(offer);
  const speech = speechScript8Seconds(offer);

  return `Crie um vídeo publicitário fotorrealista de exatamente ${VIDEO_DURATION_SECONDS} segundos.

PERSONAGEM:
Use Avatar_Silvia como referência visual obrigatória. Preserve rigorosamente a identidade da mesma mulher da imagem: mesmos traços faciais, formato do rosto, pele morena, cabelo escuro liso na altura dos ombros e aparência geral. Preserve o figurino: camiseta azul-marinho e calça jeans escura. Não alterar rosto, cabelo, idade aparente, corpo ou roupa durante o vídeo.

PRODUTO:
Use a imagem do produto selecionado como referência visual obrigatória. A personagem está ${interaction}. Preserve fielmente formato, proporções, cores e características visuais do produto. Não modificar, deformar ou inventar partes do produto.

CENA:
O fundo é um ${background}. Iluminação cinematográfica suave e realista, valorizando naturalmente o rosto da apresentadora e o produto.

ATUAÇÃO:
A personagem olha diretamente para a câmera e apresenta a oferta de maneira simpática, espontânea e entusiasmada. Enquanto fala, realiza pequenos movimentos naturais de cabeça e gestos suaves com as mãos. Ao mencionar o produto, faz um gesto discreto em direção a ele. Evitar movimentos exagerados, repetitivos ou artificiais.

CÂMERA:
Plano médio. Câmera fixa. Um único take contínuo durante os ${VIDEO_DURATION_SECONDS} segundos. Sem cortes. Sem zoom. Sem transições. Sem mudança de enquadramento.

ÁUDIO E LIPSYNC:
Voz feminina adulta em português brasileiro. Tom comercial natural, simpático e entusiasmado. Dicção clara e ritmo fluido. Lipsync preciso e sincronizado com cada palavra. A fala deve começar imediatamente e ser pronunciada integralmente. Nenhuma palavra pode ser cortada, omitida ou interrompida. Não acelerar artificialmente a voz. A última palavra deve terminar antes do fim do vídeo. Após a última palavra, manter aproximadamente 0,3 segundo de imagem antes do encerramento.

FALA EXATA:
${speech}

QUALIDADE:
Fotorrealista. Estética de publicidade profissional. Pele com textura natural. Expressões faciais realistas. Movimentos humanos naturais. Iluminação cinematográfica. Alta definição com aparência 4K.

RESTRIÇÕES:
Vídeo completamente limpo. Sem texto na tela. Sem legendas. Sem números na tela. Sem preço escrito. Sem elementos gráficos. Sem marca d'água. Sem movimentos artificiais. Sem deformações no rosto, mãos ou produto. Sem alteração da identidade da personagem. Sem alteração do produto de referência.`;
}
