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

const PRODUCT_IDENTITY_RULES = `REGRA CRÍTICA — SEGURANÇA E BRAND SAFETY

É estritamente obrigatório que todos os prompts visuais gerados sejam 100% "Family Friendly", neutros e "Safe For Work" (SFW).
NÃO gere, em hipótese alguma, palavras ambíguas que possam acionar filtros de conteúdo sensível (NSFW), de violência ou nudez (exemplo de palavras proibidas: "sensual", "flesh", "naked", "explosão", "violento", "sangue", "pele", "decote", "íntimo").
Mantenha a descrição estritamente técnica, profissional e comercial.

REGRA CRÍTICA — PRESERVAÇÃO EXATA DO PRODUTO

A imagem anexada é a referência visual absoluta do produto.

Durante TODO o vídeo, preserve o produto exatamente como aparece na imagem original.

TEXTOS, LOGOTIPOS, NÚMEROS E ETIQUETAS

NÃO recrie, reinterprete, traduza, corrija ou invente nenhum texto existente no produto.

Todos os elementos gráficos presentes fisicamente no produto devem permanecer visualmente idênticos à imagem de referência em todos os frames.

Isso inclui:

- nome da marca;
- logotipo;
- números;
- voltagem;
- letras;
- símbolos;
- etiquetas;
- adesivos;
- tipografia;
- posicionamento dos textos;
- tamanho dos textos;
- orientação;
- cores.

Se a imagem de referência mostrar, por exemplo, uma determinada marca ou número escrito no produto, esse elemento deve permanecer exatamente igual, sem trocar letras, adicionar caracteres ou gerar palavras semelhantes.

REGRA DE PRIORIDADE

A prioridade máxima do vídeo é:

1. Preservar exatamente a aparência do produto.
2. Preservar logotipos, textos e etiquetas existentes.
3. Preservar cores e proporções.
4. Demonstrar a utilização.
5. Movimento cinematográfico.

Se houver conflito entre um movimento de câmera e a preservação do produto, priorize a preservação do produto.

CONSISTÊNCIA ENTRE FRAMES

Trate o produto da imagem como um objeto visual fixo e consistente, e não como um novo produto que deve ser redesenhado a cada cena.

O mesmo produto deve continuar sendo o mesmo objeto ao longo de todo o vídeo.

Não permitir que letras ou números mudem entre frames.

Não permitir:

“FALASCA” → “FALACA”
“FALASCA” → “FALASCO”
“21V” → “24V”
“21V” → “2IV”

Nem qualquer outra alteração semelhante.

NÃO GERAR NOVOS TEXTOS

Não adicionar:

- textos promocionais;
- legendas;
- títulos;
- especificações;
- slogans;
- marcas adicionais;
- etiquetas;
- números;
- caracteres aleatórios.

O único texto permitido no vídeo é aquele já existente fisicamente no produto da imagem de referência.

MOVIMENTO DE CÂMERA PARA MAIOR FIDELIDADE

Evite movimentos rápidos de câmera.

Evite rotações completas do produto.

Evite mostrar ângulos extremos que não estejam suficientemente representados na imagem original.

Utilize principalmente:

- câmera estável;
- movimentos lentos;
- pequenos movimentos laterais;
- aproximações suaves;
- close-ups controlados;
- enquadramentos semelhantes à referência.

Quando um lado do produto não estiver visível na imagem original, não invente textos, etiquetas ou logotipos para esse lado.

DURANTE A UTILIZAÇÃO

Ao mostrar mãos utilizando o produto, preserve o corpo principal da ferramenta com máxima fidelidade.

Anime principalmente:

- mãos;
- gatilho;
- mandril;
- broca;
- acessórios;
- elementos necessários para demonstrar a utilização.

Evite deformar ou regenerar desnecessariamente as áreas do produto que contêm marca, logotipo, números ou etiquetas.

REGRA FINAL

IMAGE-TO-VIDEO COM PRESERVAÇÃO DE IDENTIDADE DO PRODUTO.

Não redesenhe o produto.

Não crie uma versão semelhante.

Não substitua por outro modelo.

Não estilize.

Não altere a identidade visual.

Não altere textos.

Não altere logotipos.

Não altere números.

Não altere etiquetas.

O produto do primeiro ao último frame deve parecer exatamente o mesmo produto físico presente na imagem anexada.`;

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

function numeroFemininoPorExtenso(num: number): string {
  return num === 1 ? "uma" : num === 2 ? "duas" : numeroPorExtenso(num);
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
    .replace(/\b(?=[A-Z0-9-]{5,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[,;:]\s*$/g, "")
    .trim();
}

function normalizeLinguisticSpeech(name: string): string {
  return name
    .replace(/\b(?:be|d[e3])\s+[lI]mpacto\b/gi, "de Impacto")
    .replace(/\b[lI]mpacto\b/g, "Impacto")
    .replace(/\bparafusadeira\s+furadeira\b/gi, "Parafusadeira e Furadeira")
    .replace(/\bImpacto\s+(\d+)\s+baterias?\b/gi, "Impacto com $1 baterias")
    .replace(/\b(\d{1,6})\s+(baterias?|camisetas?|calças?|peças?)\b/gi, (_, raw, noun) => `${numeroFemininoPorExtenso(Number(raw))} ${noun}`)
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

type VisualDirection = {
  scene: string;
  interaction: string;
  composition: string;
};

function visualDirectionByCategory(offer: GeminiPromptOffer): VisualDirection {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();

  if (/(parafusadeira|furadeira|martelete|serra\s*(?:circular|tico|mármore)?|esmerilhadeira|lixadeira|soprador|ferramenta|chave\s+de\s+impacto)/i.test(searchable)) {
    return {
      scene: "oficina contemporânea premium, organizada e sofisticada, com bancada robusta de madeira escura e metal, painel de ferramentas e elementos discretos de marcenaria suavemente desfocados ao fundo. Iluminação cinematográfica quente e contrastada, com luz principal suave sobre a apresentadora, luz de recorte valorizando o produto e pequenos pontos de luz âmbar criando profundidade. Estética de campanha profissional de ferramentas elétricas, sem aparência de oficina suja, depósito ou ambiente improvisado",
      interaction: "ao lado de uma bancada, apresentando o produto com um gesto natural das mãos em direção a ele, sem segurar, operar ou acionar a ferramenta",
      composition: "O produto deve permanecer apoiado e estável sobre a bancada. Mostrar exclusivamente o produto e os componentes que estiverem realmente visíveis na imagem de referência. Não adicionar maleta, brocas, soquetes, carregadores, baterias extras, ferramentas, acessórios, peças ou consumíveis que não apareçam na referência. O título da oferta não autoriza criar componentes visuais ausentes na imagem de referência",
    };
  }

  if (/(pneu|automotivo|carro|moto|capacete|compressor|aspirador\s+automotivo|politriz|lavadora)/i.test(searchable)) {
    return {
      scene: "garagem de detailing automotivo premium, extremamente limpa e organizada, com superfícies grafite, concreto polido e detalhes metálicos, iluminação linear quente e reflexos controlados. Fundo desfocado com elementos automotivos discretos, estética de comercial sofisticado e sem poluição visual",
      interaction: "ao lado do produto em uma superfície de exposição adequada, fazendo um gesto de apresentação sem utilizá-lo",
      composition: "Exibir somente o produto e os componentes realmente presentes na imagem de referência. Não adicionar veículos, acessórios automotivos, cabos, adaptadores, ferramentas ou peças extras como se fizessem parte da oferta",
    };
  }

  if (/(tv|televisor|televisão)/i.test(searchable)) {
    return {
      scene: "sala contemporânea premium com estética de home theater, mobiliário minimalista, paredes neutras, iluminação indireta quente e acabamento sofisticado. O fundo deve ter profundidade suave e aparência residencial realista, sem neon gamer excessivo",
      interaction: "ao lado do produto, apresentando-o com gesto discreto e mantendo distância suficiente para não encobrir a tela",
      composition: "Preservar exatamente tela, moldura, base, controles e acessórios somente quando estiverem visíveis na referência. Não inventar soundbar, console, controle remoto, rack ou elementos vendidos separadamente",
    };
  }

  if (/(roteador|celular|smartphone|notebook|pc|gamer|wi-fi|tecnologia|eletrônico|controle|gamepad|headset|fone|tablet)/i.test(searchable)) {
    return {
      scene: "estúdio de tecnologia contemporâneo premium, com superfícies escuras acetinadas, detalhes metálicos e iluminação de recorte azul suave combinada com luz quente no rosto. Fundo minimalista e desfocado, elegante e moderno, evitando aparência de cenário gamer genérico",
      interaction: "apresentando o produto para a câmera de forma natural; quando o formato permitir, segurando-o cuidadosamente sem cobrir detalhes importantes da referência",
      composition: "Exibir somente o produto e os acessórios realmente presentes na imagem de referência. Não adicionar cabos, carregadores, capas, controles, suportes, periféricos ou outros itens não mostrados na referência",
    };
  }

  if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer|fritadeira|cozinha|panela|forno|micro-ondas)/i.test(searchable)) {
    return {
      scene: "cozinha residencial contemporânea premium, com bancada limpa de pedra clara ou madeira sofisticada, armários modernos, detalhes em metal escovado e iluminação quente e aconchegante. Fundo com profundidade suave, aparência de campanha de eletrodomésticos e sem excesso de objetos decorativos",
      interaction: "ao lado do produto sobre a bancada, com a mão gesticulando em direção a ele sem operá-lo",
      composition: "O produto deve ser o protagonista da bancada. Mostrar somente componentes, recipientes, tampas e acessórios realmente visíveis na imagem de referência. Não adicionar alimentos, utensílios, cápsulas, copos, bandejas ou acessórios inexistentes na referência",
    };
  }

  if (/(shampoo|máscara|kit|beleza|maquiagem|perfume|creme|cabelo|pele)/i.test(searchable)) {
    return {
      scene: "beauty studio premium, clean e sofisticado, com tons neutros rosados e dourados discretos, bancada elegante e iluminação difusa suave semelhante a campanha de cosméticos de luxo. Fundo minimalista, organizado e levemente desfocado",
      interaction: "apresentando o produto próximo ao corpo ou sobre uma bancada, com gesto delicado e natural",
      composition: "Preservar quantidade, embalagens, tampas e frascos exatamente como na referência. Não criar itens extras de kit, pincéis, flores, espelhos, cosméticos adicionais ou embalagens não presentes na imagem original",
    };
  }

  if (/(tênis|tenis|roupa|moda|vestuário|calçado|calcado|sapato|sandalia|bota)/i.test(searchable)) {
    return {
      scene: "fashion studio contemporâneo premium com arquitetura minimalista, superfícies neutras, iluminação editorial suave e detalhes de luz quente. Fundo elegante, limpo e desfocado, com estética de campanha de moda profissional",
      interaction: "ao lado do produto exibido em um expositor minimalista, apontando discretamente para ele sem alterar sua forma",
      composition: "Mostrar somente a peça ou o par exatamente como aparece na referência. Não adicionar caixa, cadarços extras, meias, bolsas, acessórios ou variações de cor inexistentes",
    };
  }

  if (/(cadeira|poltrona|sofá|sofa|mesa|estante|armário|armario|móvel|movel|decoração|decoracao)/i.test(searchable)) {
    return {
      scene: "interior residencial sofisticado e contemporâneo, com arquitetura clean, materiais naturais, iluminação quente indireta e composição editorial de decoração. Fundo com profundidade suave e poucos elementos complementares, todos neutros e sem competir com o produto",
      interaction: "ao lado do produto em posição natural de apresentação; sentada nele apenas quando a própria categoria e a imagem de referência indicarem claramente que isso é apropriado",
      composition: "Manter dimensões, quantidade e configuração visual do produto conforme a referência. Não adicionar almofadas, mesas laterais, objetos decorativos ou módulos extras como parte da oferta",
    };
  }

  return {
    scene: "estúdio publicitário contemporâneo premium, com arquitetura minimalista, superfícies neutras, iluminação cinematográfica quente e elegante, profundidade de campo suave e elementos de fundo discretos coerentes com a categoria do produto. Evitar cenário vazio, genérico ou visualmente cru",
    interaction: "ao lado do produto da imagem de referência, gesticulando naturalmente em direção a ele",
    composition: "Exibir exclusivamente o produto e os componentes realmente visíveis na imagem de referência. Não inventar acessórios, peças, embalagens, kits ou objetos complementares que não estejam presentes na referência",
  };
}

function speechScript8Seconds(offer: GeminiPromptOffer): string {
  const baseProductName = getSpeakableProductName(offer);
  const numericPrice = Number(offer.current_price);
  const price = Number.isFinite(numericPrice) && numericPrice > 0 ? precoPorExtenso(numericPrice) : "";
  const article = /^(?:air fryer|cafeteira|fritadeira|parafusadeira|furadeira|torneira|calça|camiseta|camisa|sandália|bota)\b/iu.test(baseProductName) ? "uma" : "um";

  if (wordCount(baseProductName) <= 4) {
    const productName = compactProductName(baseProductName, 4);
    const full = `Encontre ${article} ${productName}${price ? ` por ${price}` : ""}. Acesse!`;
    if (wordCount(full) <= MAX_SPEECH_WORDS) return `"${full}"`;
  }

  const priceWords = price ? wordCount(price) + 1 : 0;
  const maxProductWords = Math.max(1, MAX_SPEECH_WORDS - priceWords - 1);
  const productName = compactProductName(baseProductName, maxProductWords);
  const compact = `${productName}${price ? ` por ${price}` : ""}. Acesse a publicação!`;
  if (wordCount(compact) <= MAX_SPEECH_WORDS) return `"${compact}"`;

  const shortCompact = `${productName}${price ? ` por ${price}` : ""}. Acesse!`;
  return `"${shortCompact}"`;
}

export function formatLongPriceForSpeech(valor: number | string | null | undefined): string {
  return precoPorExtenso(valor);
}

export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  const direction = visualDirectionByCategory(offer);
  const speech = speechScript8Seconds(offer);

  return `Crie um vídeo publicitário fotorrealista de exatamente ${VIDEO_DURATION_SECONDS} segundos.\n\n${PRODUCT_IDENTITY_RULES}\n\nPERSONAGEM:\nUse exclusivamente a imagem de referência oficial identificada como ${OFFICIAL_AVATAR_REFERENCE} como referência visual obrigatória e principal da personagem. Preserve rigorosamente a mesma mulher da imagem de referência: mesmos traços faciais, formato do rosto, tom de pele morena, cabelo escuro liso na altura dos ombros, proporções corporais e aparência geral. Preserve exatamente o figurino oficial da referência: camiseta azul-marinho, calça jeans escura e tênis branco. A estampa original da camiseta faz parte da identidade visual da personagem e deve permanecer idêntica à imagem de referência durante todo o vídeo. Preserve exatamente o logotipo e os elementos gráficos já existentes na camiseta, incluindo o texto \"CAÇA OFERTA\", a chama, o carrinho e a etiqueta de desconto. Não recriar, reinterpretar, traduzir, corrigir, substituir, deformar ou inventar letras, palavras, logotipos, símbolos ou elementos gráficos da camiseta. Não substituir \"CAÇA OFERTA\" por qualquer outro nome ou marca. Não alterar rosto, cabelo, idade aparente, corpo, roupa, estampa, cores ou identidade visual da personagem durante o vídeo.\n\nPRODUTO:\nUse a imagem do produto selecionado como referência visual obrigatória. A personagem está ${direction.interaction}. Preserve fielmente formato, proporções, cores, textos, logotipos e características visuais originais do produto. Não modificar, deformar, traduzir, substituir ou inventar partes, marcas ou textos do produto.\n\nCOMPOSIÇÃO DO PRODUTO:\n${direction.composition}. A imagem de referência é a autoridade visual: informações do título, descrição ou fala não autorizam adicionar componentes que não estejam visíveis nela.\n\nCENA:\nO ambiente é uma ${direction.scene}. Valorizar naturalmente o rosto da apresentadora e o produto, mantendo separação visual clara entre primeiro plano e fundo.\n\nATUAÇÃO:\nA personagem olha diretamente para a câmera e apresenta a oferta de maneira simpática, espontânea e entusiasmada. Enquanto fala, realiza pequenos movimentos naturais de cabeça e gestos suaves com as mãos. Ao mencionar o produto, faz um gesto discreto em direção a ele. Evitar movimentos exagerados, repetitivos ou artificiais.\n\nCÂMERA:\nPlano médio. Câmera fixa. Um único take contínuo durante os ${VIDEO_DURATION_SECONDS} segundos. Sem cortes. Sem zoom. Sem transições. Sem mudança de enquadramento.\n\nÁUDIO E LIPSYNC:\nVoz feminina adulta em português brasileiro. Tom comercial natural, simpático e entusiasmado. Dicção clara e ritmo fluido. Pronunciar todas as palavras em português brasileiro correto. Todos os números presentes na fala devem ser pronunciados integralmente por extenso. Valores monetários devem ser pronunciados usando \"reais\" e \"centavos\" quando aplicável. Não pronunciar algarismos, abreviações técnicas, símbolos ou códigos como parte da locução. Lipsync preciso e sincronizado com cada palavra. A fala deve começar imediatamente e ser pronunciada integralmente. Nenhuma palavra pode ser cortada, omitida ou interrompida. Não acelerar artificialmente a voz. A última palavra deve terminar antes do fim do vídeo. Após a última palavra, manter aproximadamente 0,3 segundo de imagem antes do encerramento.\n\nFALA EXATA:\n${speech}\n\nQUALIDADE:\nFotorrealista. Estética de publicidade profissional. Pele com textura natural. Expressões faciais realistas. Movimentos humanos naturais. Iluminação cinematográfica. Alta definição com aparência 4K.\n\nRESTRIÇÕES:\nVídeo completamente limpo. Não adicionar texto novo na tela. Textos, logotipos, símbolos, estampas e elementos gráficos já existentes nas imagens de referência da personagem e do produto devem ser preservados exatamente como aparecem. Não adicionar legendas. Não adicionar números ou preços escritos. Não adicionar elementos gráficos novos. Não adicionar marca d'água. Não adicionar acessórios, componentes, peças, embalagens, ferramentas, baterias, cabos, carregadores, consumíveis ou objetos como parte da oferta se eles não estiverem visíveis na imagem de referência do produto. Não transformar o produto em um kit maior do que a referência visual. Sem movimentos artificiais. Sem deformações no rosto, mãos ou produto. Sem alteração da identidade da personagem. Sem alteração do figurino oficial. Sem alteração, substituição ou invenção do nome, logotipo ou estampa existente na camiseta. Sem alteração do produto de referência.`;
}
