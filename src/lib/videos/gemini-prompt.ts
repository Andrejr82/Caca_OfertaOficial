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
const OFFICIAL_AVATAR_REFERENCE = "Avatar_Silvia";

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

function normalizeTechnicalSpecsForSpeech(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*["”″]/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:l|litros?|ml|w|watts?|kw|v|volts?|mah|gb|tb|hz|khz|mhz|ghz|mp|mpx|polegadas?)\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*btus?\b/gi, " ")
    .replace(/\b(?:3g|4g|5g)\b/gi, " ")
    .replace(/\b(?:painel\s+digital|digital|bivolt|inox|wifi|wi-fi|bluetooth|full\s+hd|ultra\s+hd|4k|8k|hdr|led|qled|oled)\b/gi, " ")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[,;:]\s*$/g, "")
    .trim();
}

function simplifyCommercialNameForSpeech(name: string): string {
  return name
    .replace(/\bfritadeira\s+air\s*fryer\b/gi, "Air Fryer")
    // Códigos técnicos mistos com letras e números (ex.: BAF95A, XJ900, SM-A556E).
    // Preserva nomes comerciais reconhecíveis; a etapa linguística converte números falados por extenso.
    .replace(/\b(?=[A-Z0-9-]{5,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[,;:]\s*$/g, "")
    .trim();
}

/**
 * Corrige erros linguísticos evidentes de títulos de marketplace e prepara o nome para locução.
 * Esta função altera somente o nome falável do vídeo; product_name/short_name permanecem intactos.
 */
function normalizeLinguisticSpeech(name: string): string {
  return name
    // Erros recorrentes de digitação/OCR observados em títulos de marketplace.
    .replace(/\b(?:be|d[e3])\s+[lI]mpacto\b/gi, "de Impacto")
    .replace(/\b[lI]mpacto\b/g, "Impacto")
    // Evita construções comerciais truncadas na locução.
    .replace(/\bparafusadeira\s+furadeira\b/gi, "Parafusadeira e Furadeira")
    .replace(/\bImpacto\s+(\d+)\s+baterias?\b/gi, "Impacto com $1 baterias")
    // Todo número que permanecer na fala é pronunciado por extenso.
    .replace(/\b\d{1,6}\b/g, (raw) => numeroPorExtenso(Number(raw)))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function getSpeakableProductName(offer: GeminiPromptOffer): string {
  const source = offer.short_name?.trim() || offer.product_name.trim();
  const normalized = normalizeLinguisticSpeech(
    simplifyCommercialNameForSpeech(normalizeTechnicalSpecsForSpeech(source))
  );
  return normalized || source;
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
  if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer|fritadeira)/i.test(searchable)) {
    return "ao lado do produto da imagem de referência sobre uma bancada, com a mão gesticulando em direção a ele";
  }
  if (/(shampoo|máscara|kit|beleza|maquiagem|perfume|creme|cabelo|pele)/i.test(searchable)) {
    return "segurando o produto da imagem de referência com as mãos, exibindo-o para a câmera";
  }
  return "ao lado do produto da imagem de referência, gesticulando em direção a ele";
}

function studioBackground(offer: GeminiPromptOffer): string {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();

  if (/(roteador|celular|smartphone|notebook|pc|gamer|wi-fi|tecnologia|eletrônico|controle|gamepad|headset|cadeira\s*gamer|tv|televisor)/i.test(searchable)) {
    return "estúdio escuro com luzes suaves de neon azul e roxo, estética gamer premium";
  }
  if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer|fritadeira|cozinha)/i.test(searchable)) {
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

function speechScript8Seconds(offer: GeminiPromptOffer): string {
  const baseProductName = getSpeakableProductName(offer);
  const price = precoPorExtenso(offer.current_price);

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

export function formatLongPriceForSpeech(valor: number | string | null | undefined): string {
  return precoPorExtenso(valor);
}

export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  const interaction = productInteraction(offer);
  const background = studioBackground(offer);
  const speech = speechScript8Seconds(offer);

  return `Crie um vídeo publicitário fotorrealista de exatamente ${VIDEO_DURATION_SECONDS} segundos.\n\nPERSONAGEM:\nUse exclusivamente a imagem de referência oficial identificada como ${OFFICIAL_AVATAR_REFERENCE} como referência visual obrigatória e principal da personagem. Preserve rigorosamente a mesma mulher da imagem de referência: mesmos traços faciais, formato do rosto, tom de pele morena, cabelo escuro liso na altura dos ombros, proporções corporais e aparência geral. Preserve exatamente o figurino oficial da referência: camiseta azul-marinho, calça jeans escura e tênis branco. A estampa original da camiseta faz parte da identidade visual da personagem e deve permanecer idêntica à imagem de referência durante todo o vídeo. Preserve exatamente o logotipo e os elementos gráficos já existentes na camiseta, incluindo o texto \"CAÇA OFERTA\", a chama, o carrinho e a etiqueta de desconto. Não recriar, reinterpretar, traduzir, corrigir, substituir, deformar ou inventar letras, palavras, logotipos, símbolos ou elementos gráficos da camiseta. Não substituir \"CAÇA OFERTA\" por qualquer outro nome ou marca. Não alterar rosto, cabelo, idade aparente, corpo, roupa, estampa, cores ou identidade visual da personagem durante o vídeo.\n\nPRODUTO:\nUse a imagem do produto selecionado como referência visual obrigatória. A personagem está ${interaction}. Preserve fielmente formato, proporções, cores, textos, logotipos e características visuais originais do produto. Não modificar, deformar, traduzir, substituir ou inventar partes, marcas ou textos do produto.\n\nCENA:\nO fundo é um ${background}. Iluminação cinematográfica suave e realista, valorizando naturalmente o rosto da apresentadora e o produto.\n\nATUAÇÃO:\nA personagem olha diretamente para a câmera e apresenta a oferta de maneira simpática, espontânea e entusiasmada. Enquanto fala, realiza pequenos movimentos naturais de cabeça e gestos suaves com as mãos. Ao mencionar o produto, faz um gesto discreto em direção a ele. Evitar movimentos exagerados, repetitivos ou artificiais.\n\nCÂMERA:\nPlano médio. Câmera fixa. Um único take contínuo durante os ${VIDEO_DURATION_SECONDS} segundos. Sem cortes. Sem zoom. Sem transições. Sem mudança de enquadramento.\n\nÁUDIO E LIPSYNC:\nVoz feminina adulta em português brasileiro. Tom comercial natural, simpático e entusiasmado. Dicção clara e ritmo fluido. Pronunciar todas as palavras em português brasileiro correto. Todos os números presentes na fala devem ser pronunciados integralmente por extenso. Valores monetários devem ser pronunciados usando \"reais\" e \"centavos\" quando aplicável. Não pronunciar algarismos, abreviações técnicas, símbolos ou códigos como parte da locução. Lipsync preciso e sincronizado com cada palavra. A fala deve começar imediatamente e ser pronunciada integralmente. Nenhuma palavra pode ser cortada, omitida ou interrompida. Não acelerar artificialmente a voz. A última palavra deve terminar antes do fim do vídeo. Após a última palavra, manter aproximadamente 0,3 segundo de imagem antes do encerramento.\n\nFALA EXATA:\n${speech}\n\nQUALIDADE:\nFotorrealista. Estética de publicidade profissional. Pele com textura natural. Expressões faciais realistas. Movimentos humanos naturais. Iluminação cinematográfica. Alta definição com aparência 4K.\n\nRESTRIÇÕES:\nVídeo completamente limpo. Não adicionar texto novo na tela. Textos, logotipos, símbolos, estampas e elementos gráficos já existentes nas imagens de referência da personagem e do produto devem ser preservados exatamente como aparecem. Não adicionar legendas. Não adicionar números ou preços escritos. Não adicionar elementos gráficos novos. Não adicionar marca d'água. Sem movimentos artificiais. Sem deformações no rosto, mãos ou produto. Sem alteração da identidade da personagem. Sem alteração do figurino oficial. Sem alteração, substituição ou invenção do nome, logotipo ou estampa existente na camiseta. Sem alteração do produto de referência.`;
}
