import type { OfficialAIChannel, OfficialAIDraftForRegeneration, OfficialAIOffer, OfficialConversionCopyContract } from "./types";
import { marketplaceLabel } from "./icon-catalog";
import { renderSocialHashtags } from "./social-hashtags";

const SYSTEM_PROMPT = `Você é o copywriter de ofertas da Official AI do Caça Oferta.
Você não conversa, não introduz a mensagem e não escreve a copy final. Produza somente JSON estruturado para a Copy V3.

Regras obrigatórias:
- Gere somente hook, benefitLine e contextLine. Nunca gere produto, preço, desconto, marketplace, frete, cupom, estoque, urgência, parcelamento, avaliação, vendas, CTA, hashtags ou URL.
- O gancho (hook) deve ser uma abertura comercial humana, focada no produto ou em um benefício explicitamente comprovado nos dados; não escreva uma descrição burocrática de catálogo nem comece com “Se você procura”, “Olha esse” ou “Olha essa”. Só mencione urgência, prazo ou escassez quando houver evidência persistida para isso.
- O gancho não pode passar de 90 caracteres.
- Escreva como uma recomendação curta de uma pessoa: varie a abertura, evite repetir “oferta” e “achado” em toda mensagem e prefira o benefício comercial comprovado.
- Use somente fatos presentes nos dados de entrada. Nunca invente preço, desconto, frete, cupom, estoque, parcelamento, marca, especificação, atributo ou benefício.
- benefitLine e contextLine só podem usar fatos sustentados por product_name, category, marketplace_metrics, explainability e atributos/metadados persistidos. Nunca invente benefício técnico.
- Nunca escreva: Olá, Nova chegada, Temos um novo, Você vai amar, Confira, Não perca, Imperdível, Produto incrível, Compre agora, Aproveite enquanto durar, Essa oportunidade é única, Só agora, Corre que, estoque acaba ou antes que o preço suba.
- Nunca inclua URL, [link] ou qualquer placeholder. A persistência anexará exatamente um link rastreado.
- Responda somente JSON válido com todos os campos solicitados. Não retorne estados, aprovação, publicação nem instruções operacionais.`;

function buildCopyV3Prompt(input: Record<string, unknown>) {
  const channels = (input.channels ?? [input.channel]) as readonly OfficialAIChannel[];
  return {
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      ...input,
      outputContract: {
        hook: "Gancho curto e específico, máximo 90 caracteres, uma linha",
        benefitLine: "Benefício objetivo sustentado pelos dados, ou string vazia quando não houver evidência",
        contextLine: "Contexto natural de uso/compra sustentado pelos dados, ou string vazia quando não houver evidência"
      },
      formatting: "Retorne exatamente esse objeto JSON, sem markdown. Formate valores em reais com duas casas decimais."
    })
  };
}

function discountPercentage(currentPrice: number, originalPrice: number | null) {
  if (!originalPrice || originalPrice <= currentPrice) return null;
  return Math.round((1 - currentPrice / originalPrice) * 100);
}

export interface CopyV3Facts {
  productName: string;
  shortName?: string | null;
  marketplace: string;
  category: string | null;
  currentPrice: number;
  originalPrice: number | null;
  evidence?: Record<string, unknown>;
  freeShipping?: boolean | null;
}

export type CopyV2Facts = CopyV3Facts;

export interface CopyV3Fields {
  hook?: string | null;
  benefitLine?: string | null;
  contextLine?: string | null;
}

const ATTRIBUTE_PATTERNS = [
  { pattern: /\bkit\s+bolsa\s+feminina\b/iu, emoji: "👜", hook: "Kit com bolsa feminina" },
  { pattern: /\bconjunto\s+camiseta\s*\+\s*bermuda\b/iu, emoji: "👕", hook: "Conjunto com camiseta + bermuda" },
  { pattern: /\bmoletom\s+flanelado\s+com\s+zíper\s+e\s+capuz\b/iu, emoji: "🧥", hook: "Moletom flanelado com zíper e capuz" },
  { pattern: /\b\d+(?:[.,]\d+)?\s*(?:TB|GB)(?:\s+PCIe\s+\d(?:\.\d)?)?\b/iu, emoji: "💾" },
  { pattern: /\bBluetooth\s+\d(?:\.\d)?\b/iu, emoji: "🎧" },
  { pattern: /\b(?:Bivolt(?:\s+110V\/220V)?|110V\/220V)\b/iu, emoji: "🔌" },
  { pattern: /\b\d+(?:[.,]\d+)?\s*cm\b/iu, emoji: "📏" },
  { pattern: /\bRecarregável\b/iu, emoji: "🔋" },
  { pattern: /\bPortátil\b/iu, emoji: "🧵" },
  { pattern: /\bÀ prova d[’']água\b/iu, emoji: "🛡️" },
  { pattern: /\bTampa de vidro\b/iu, emoji: "🍳" },
  { pattern: /\bLED\b/iu, emoji: "💡" }
] as const;

const formatBRL = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function persistedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(persistedStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(persistedStrings);
  return [];
}

function objectiveAttribute(facts: CopyV2Facts) {
  const sources = [facts.productName, ...persistedStrings(facts.evidence ?? {})];
  for (const source of sources) {
    for (const candidate of ATTRIBUTE_PATTERNS) {
      const match = source.match(candidate.pattern)?.[0];
      if (match) return { text: match.replace(/\s+/gu, " ").trim(), emoji: candidate.emoji, hook: candidate.hook };
    }
  }
  return null;
}

function trimDanglingTitleWords(value: string) {
  let result = value.replace(/[\s,;:–—-]+$/gu, "").trim();
  while (/\b(?:com|para|e|de|da|do|das|dos|em|no|na|nos|nas)$/iu.test(result)) {
    result = result.replace(/\s+\S+$/u, "").replace(/[\s,;:–—-]+$/gu, "").trim();
  }
  return result;
}

function cleanProductName(value: string) {
  const normalized = value
    .replace(/^\s*(?:oferta|promoção|achadinho)\s*[:\-–—]\s*/iu, "")
    .replace(/\s*[|•]\s*(?:shopee|amazon|mercado livre)\s*$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const words = normalized.split(" ");
  const key = (word: string) => word.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("pt-BR");
  for (let start = 0; start < words.length; start += 1) {
    for (let length = Math.floor((words.length - start) / 2); length > 0; length -= 1) {
      const left = words.slice(start, start + length).map(key).join("\0");
      const right = words.slice(start + length, start + length * 2).map(key).join("\0");
      if (left !== right) continue;
      words.splice(start + length, length);
      start = Math.max(-1, start - 1);
      break;
    }
  }
  const cleaned = words.join(" ");
  if (cleaned.length <= 76) return trimDanglingTitleWords(cleaned);
  const cut = cleaned.lastIndexOf(" ", 76);
  return trimDanglingTitleWords(cut > 0 ? cleaned.slice(0, cut) : words[0]);
}

function compactProductName(value: string) {
  const cleaned = cleanProductName(value)
    .replace(/\bsem\s+fio\s+e\s+com\s+fio\b/iu, "sem fio/com fio")
    .replace(/\s+\b(?:preto|preta|branco|branca|wireless|joystick)\b/giu, "")
    .replace(/\s+para\s+computador\b/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (/\bcontrole\s+xbox\s+360\b/iu.test(cleaned)) {
    const mode = cleaned.match(/sem\s+fio\/com\s+fio/iu)?.[0] ?? "";
    return `Controle Xbox 360${mode ? ` ${mode}` : ""}`;
  }
  if (cleaned.length <= 58) return cleaned;
  const words = cleaned.split(" ");
  return trimDanglingTitleWords(words.slice(0, 7).join(" "));
}

const DEFAULT_HOOKS = {
  discount: ["🔥 Economia confirmada de {saving}", "💡 Desconto verificado de {saving}", "✨ Oferta com economia de {saving}"],
  standard: ["✨ Oferta em destaque", "💡 Boa opção para sua rotina", "⭐ Seleção oficial do dia"]
} as const;

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % length;
}

function humanContext(facts: CopyV2Facts) {
  const text = `${facts.category ?? ""} ${facts.productName}`.toLocaleLowerCase("pt-BR");
  if (/tv|televis|geladeira|lavadora|lava e seca|micro-ondas|cooktop|forno|fogão|ar-condicionado|aspirador/iu.test(text)) return "🏠 Para equipar a casa";
  if (/sofá|guarda-roupa|cama|colchão|mesa|escrivaninha|cadeira|rack|cômoda/iu.test(text)) return "🏠 Para a casa";
  if (/torneira|pia|cozinha|panela|fritadeira|liquidificador|batedeira|airfryer/iu.test(text)) return "🍳 Para equipar a sua cozinha";
  if (/celular|notebook|tablet|monitor|console|fone|headset|tecnologia/iu.test(text)) return "📱 Para quem gosta de tecnologia";
  if (/cachorro|gato|pet|bebê|maternidade|fralda/iu.test(text)) return "🐾 Para a rotina da família";
  return null;
}

export function sanitizeOfficialAIHook(value: string) {
  return value
    .replace(/\b(?:baixou muito|só agora|so agora|últimas unidades|ultimas unidades|estoque(?: costuma)? esgotar(?: em minutos)?|corre que[^\n.!?]*)\b/giu, "")
    .replace(/\s{2,}/gu, " ")
    .replace(/\s+([!?.,])/gu, "$1")
    .trim();
}

function hookFor(facts: CopyV2Facts, hook?: string) {
  const value = hook ? sanitizeOfficialAIHook(hook.replace(/\s+/gu, " ")) : "";
  const isGenericLegacyHook = /^(?:🔥\s*)?(?:preço baixou|achado do dia)$/iu.test(value);
  if (value && !isGenericLegacyHook && value.length <= 90 && !/[\n\r]|https?:\/\/|www\./iu.test(value)) return value;

  const product = compactProductName(facts.productName);
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  const saving = facts.originalPrice && facts.originalPrice > facts.currentPrice
    ? formatBRL(facts.originalPrice - facts.currentPrice)
    : null;

  if (!hook) {
    if (discount !== null && saving) return `🔥 ${product} com economia de ${saving}`;
    if (facts.currentPrice > 0) return `💸 ${product} por ${formatBRL(facts.currentPrice)}`;
    return `✨ ${product}`;
  }

  if (!facts.currentPrice || facts.currentPrice <= 0) return `✨ ${product}`;
  const templates = discount === null ? DEFAULT_HOOKS.standard : DEFAULT_HOOKS.discount;
  const template = templates[stableIndex(`${facts.marketplace}|${facts.productName}|${facts.currentPrice}`, templates.length)];
  return template.replace("{price}", formatBRL(facts.currentPrice)).replace("{saving}", saving ?? formatBRL(facts.currentPrice));
}

function shippingLine(facts: CopyV2Facts) {
  return facts.freeShipping === true ? "🚚 Frete grátis confirmado" : null;
}

export function buildCopyV2ChannelCopy(facts: CopyV2Facts, channel: OfficialAIChannel, hook?: string) {
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  const attribute = objectiveAttribute(facts);
  const marketplace = marketplaceLabel(facts.marketplace);
  const freight = shippingLine(facts);

  if (channel === "facebook") {
    const blocks = [
      hookFor(facts, hook),
      `🛍️ ${cleanProductName(facts.productName)}`,
      `${marketplace.icon} ${marketplace.text}`,
      ...(freight ? [freight] : []),
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      discount && facts.originalPrice && facts.currentPrice > 0
        ? `📉 De ${formatBRL(facts.originalPrice)}\n💰 Por *${formatBRL(facts.currentPrice)}* (${discount}% OFF)`
        : (facts.currentPrice > 0 ? `💰 ${formatBRL(facts.currentPrice)}` : `💰 Consulte o preço atual no link!`),
      `👉 Veja a oferta no primeiro comentário 👇`,
      renderSocialHashtags(facts, "facebook")
    ];
    return blocks.join("\n\n");
  }

  if (channel === "whatsapp") {
    const blocks = [
      hookFor(facts, hook),
      `🛍️ ${cleanProductName(facts.productName)}`,
      `${marketplace.icon} ${marketplace.text}`,
      ...(freight ? [freight] : []),
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      ...(discount !== null && facts.originalPrice !== null && facts.currentPrice > 0 ? [`❌ *Preço anterior: ${formatBRL(facts.originalPrice)}*`] : []),
      facts.currentPrice > 0 ? `✅ *Valor confirmado: ${formatBRL(facts.currentPrice)}* ${discount ? `(${discount}% OFF)` : ''}`.trim() : `✅ Consulte o valor no link!`,
      `👉 Ver oferta:`
    ];
    return blocks.join("\n\n");
  }

  if (channel === "telegram") {
    const blocks = [
      hookFor(facts, hook),
      `🛍️ ${cleanProductName(facts.productName)}`,
      `${marketplace.icon} ${marketplace.text}`,
      ...(freight ? [freight] : []),
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      discount && facts.originalPrice && facts.currentPrice > 0
        ? `📉 De ${formatBRL(facts.originalPrice)}\n💰 Por *${formatBRL(facts.currentPrice)}* (${discount}% OFF)`
        : (facts.currentPrice > 0 ? `💰 *${formatBRL(facts.currentPrice)}*` : `💰 Consulte o preço atual no link!`),
      `👉 Ver oferta:`
    ];
    return blocks.join("\n\n");
  }

  if (channel === "instagram") {
    const hasPrice = facts.currentPrice && facts.currentPrice > 0;
    const context = humanContext(facts);
    const blocks = [
      hookFor(facts, hook),
      context ? `${context}: **${cleanProductName(facts.productName)}**.` : `🛍️ **${cleanProductName(facts.productName)}**.`,
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      ...(freight ? [freight] : []),
      hasPrice
        ? (discount ? `📉 Economia verificada de **${discount}%** sobre o preço anterior.` : null)
        : `💰 Consulte o preço atual no anúncio.`,
      hasPrice
        ? (discount && facts.originalPrice
            ? `💰 **De ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)}**`
            : `💰 **${formatBRL(facts.currentPrice)}**`)
        : null,
      `🔎 **Veja a oferta no link da bio ou nos Stories.** 👇`,
      renderSocialHashtags(facts, "instagram")
    ].filter(Boolean);
    return blocks.join("\n\n");
  }

  const priceBlock = discount !== null && facts.originalPrice !== null
    ? [`📉 De ${formatBRL(facts.originalPrice)}`, `💰 Por ${formatBRL(facts.currentPrice)} (${discount}% OFF)`]
    : [`💰 ${formatBRL(facts.currentPrice)}`];

  const blocks = [
    hookFor(facts, hook),
    `🛍️ ${cleanProductName(facts.productName)}`,
    priceBlock.join("\n")
  ];
  if (attribute) blocks.push(`✨ ${attribute.text}`);
  blocks.push("🛒 Ver oferta 👇");
  return blocks.join("\n\n");
}

export function buildOfficialPrompt(offer: OfficialAIOffer, channels: readonly OfficialAIChannel[]) {
  return buildCopyV3Prompt({
    task: "Gere os campos estruturados da Copy V3 para cada canal solicitado.",
    product: {
      title: offer.productName,
      marketplace: offer.marketplace,
      category: offer.category,
      currentPrice: offer.currentPrice,
      originalPrice: offer.originalPrice,
      discountPercentage: discountPercentage(offer.currentPrice, offer.originalPrice),
      persistedMetadata: offer.explainability
    },
    channels,
    channelGuidance: {
      whatsapp: "Mais curto, sem hashtags e CTA direto.",
      telegram: "Blocos curtos; preço anterior e desconto válidos permitidos; sem hashtags.",
      instagram: "Impacto visual, poucas hashtags relevantes e nenhuma URL.",
      facebook: "Feed de Página; texto factual, escaneável, com marketplace, preço e CTA direto; sem URL na resposta."
    },
    required: ["hook", "benefitLine", "contextLine"]
  });
}

export function buildOfficialRegenerationPrompt(draft: OfficialAIDraftForRegeneration) {
  return buildCopyV3Prompt({
    task: "Gere somente os campos estruturados da Copy V3 para este draft.",
    channel: draft.channel,
    product: {
      title: draft.productName,
      marketplace: draft.marketplace,
      category: draft.category,
      currentPrice: draft.currentPrice,
      originalPrice: draft.originalPrice,
      discountPercentage: discountPercentage(draft.currentPrice, draft.originalPrice),
      persistedMetadata: draft.evidence
    },
    linkRule: "NÃO inclua URL ou link na resposta; o sistema anexará o link rastreado existente.",
    required: ["hook", "benefitLine", "contextLine"]
  });
}

const COPY_V3_FORBIDDEN = /\b(?:R\$|preço|desconto|frete|cupom|estoque|parcelad|avaliaç|vendas?|%|marketplace|shopee|amazon|mercado livre)\b|(?:R\$\s*)?\d{1,4}[,.]\d{2}\b|https?:\/\/|www\.|\[[^\]]*link[^\]]*\]/iu;
const COPY_V3_UNSUPPORTED_ATTRIBUTE = /\b(?:sabor|voltagem|capacidade|material|potente|resistente|impermeável|bluetooth|jarra|filtro|frost\s+free)\b/iu;
const WEAK_CONVERSION_OPENING = /^(?:se\s+você\s+procura\b|olha\s+esse(?:s)?\b|olha\s+essa(?:s)?\b|confira\s+esta\s+oferta\b)/iu;

function v3Words(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]{4,}/gu) ?? [];
}

function validateV3Field(facts: CopyV3Facts, value: string | null | undefined) {
  if (!value) return null;
  const normalized = sanitizeOfficialAIHook(value.replace(/[\r\n]+/gu, " "));
  if (!normalized || normalized.length > 180 || COPY_V3_FORBIDDEN.test(normalized)) return null;
  const sourceText = [facts.productName, facts.category ?? "", ...persistedStrings(facts.evidence ?? {})].join(" ");
  const unsupported = normalized.match(COPY_V3_UNSUPPORTED_ATTRIBUTE)?.[0];
  if (unsupported && !new RegExp(`\\b${unsupported.replace(/\s+/gu, "\\s+")}\\b`, "iu").test(sourceText)) return null;
  const source = new Set(v3Words(sourceText));
  return v3Words(normalized).some((word) => source.has(word)) ? normalized : null;
}

function v3DerivedBenefit(facts: CopyV3Facts) {
  const text = [facts.productName, ...persistedStrings(facts.evidence ?? {})].join(" ");
  if (/controle|joystick/iu.test(text) && /sem\s+fio/iu.test(text) && /com\s+fio/iu.test(text) && /computador|pc/iu.test(text)) {
    return "Sem fio ou com fio para usar no computador.";
  }
  if (/controle|joystick/iu.test(text) && /computador|pc/iu.test(text)) return "Controle para usar no computador.";
  return null;
}

function semanticText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function semanticContextKey(value: string) {
  const text = semanticText(value);
  if (/jogar|gamer|jogos|computador/.test(text)) return "context:gaming";
  if (/rotina do pet|pet|animal/.test(text)) return "context:pet";
  if (/cozinha|preparo/.test(text)) return "context:kitchen";
  if (/rotina conectada|tecnologia/.test(text)) return "context:technology";
  if (/reparos|projetos/.test(text)) return "context:tools";
  if (/compor|moda/.test(text)) return "context:fashion";
  return `context:${text}`;
}

function semanticNarrativeKey(value: string) {
  const stopWords = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "para", "com", "na", "no", "um", "uma"]);
  return semanticText(value).split(" ").filter((word) => word.length > 2 && !stopWords.has(word)).sort().join(" ");
}

function deduplicateSemanticSlots(blocks: string[], facts: CopyV3Facts) {
  const productKey = semanticText(cleanProductName(facts.productName));
  const attributeKey = objectiveAttribute(facts) ? semanticText(objectiveAttribute(facts)!.text) : null;
  const seenContexts = new Set<string>();
  const seenSpecs = new Set<string>();
  const seenNarratives = new Set<string>();
  const titleBlock = blocks.find((block) => block.trimStart().startsWith("🛍️"));
  if (attributeKey && titleBlock && semanticText(titleBlock).includes(attributeKey)) seenSpecs.add(attributeKey);
  const output: string[] = [];
  for (const [index, block] of blocks.entries()) {
    const text = semanticText(block);
    if (!text) continue;
    const isTitle = block.trimStart().startsWith("🛍️");
    const isPrice = /r\$|off/.test(text);
    const isMarketplace = /oferta (?:na|no) /.test(text);
    const isContext = /^(?:para|no preparo|na rotina|na rotina do)/.test(text) || /jogar|rotina do pet|preparo na cozinha|reparos e projetos|rotina conectada|compor o dia a dia/.test(text);
    if (isPrice || isMarketplace || isTitle) {
      output.push(block);
      continue;
    }
    if (isContext) {
      const key = semanticContextKey(block);
      if (seenContexts.has(key)) continue;
      seenContexts.add(key);
      output.push(block);
      continue;
    }
    if (attributeKey && (text === attributeKey || text.includes(attributeKey))) {
      if (text === productKey) continue;
      if (seenSpecs.has(attributeKey)) continue;
      seenSpecs.add(attributeKey);
      output.push(block);
      continue;
    }
    if (text === productKey) {
      if (index === 0 && !titleBlock) output.push(block);
      continue;
    }
    const narrativeKey = semanticNarrativeKey(block);
    if (narrativeKey && seenNarratives.has(narrativeKey)) continue;
    if (narrativeKey) seenNarratives.add(narrativeKey);
    output.push(block);
  }
  return output;
}

function conversionProduct(facts: CopyV3Facts) {
  return compactProductName(facts.shortName?.trim() || facts.productName);
}

function conversionOffer(facts: CopyV3Facts) {
  if (!(facts.currentPrice > 0)) return null;
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  if (discount !== null && facts.originalPrice !== null) {
    return `De ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)} (${discount}% OFF)`;
  }
  return formatBRL(facts.currentPrice);
}

function conversionHook(facts: CopyV3Facts, product: string, fields?: CopyV3Fields) {
  const candidate = fields?.hook ? sanitizeOfficialAIHook(fields.hook.replace(/\s+/gu, " ")) : "";
  if (candidate && candidate.length <= 90 && !COPY_V3_FORBIDDEN.test(candidate) && !WEAK_CONVERSION_OPENING.test(candidate) && !/(?:incrível|potente|alta performance|premium|perfeito|ideal|durável|resistente)/iu.test(candidate)) return candidate;
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  if (discount !== null) return `🔥 ${product} com ${discount}% OFF.`;
  const attribute = objectiveAttribute(facts);
  if (attribute) return `${attribute.emoji} ${attribute.hook ?? `${product} com ${attribute.text}`}.`;
  const benefit = v3DerivedBenefit(facts);
  if (benefit) return `✨ ${product}: ${benefit}`;
  return `✨ ${product}.`;
}

export function buildConversionCopyContract(facts: CopyV3Facts, fields?: CopyV3Fields): OfficialConversionCopyContract {
  const product = conversionProduct(facts);
  const attribute = objectiveAttribute(facts);
  const benefit = validateV3Field(facts, fields?.benefitLine) ?? v3DerivedBenefit(facts);
  const offer = conversionOffer(facts);
  const hook = conversionHook(facts, product, fields);
  const cta = offer ? "Corre pra conferir." : "Confira os detalhes no link.";
  return { product, hook, benefit: benefit ?? (attribute ? attribute.text : null), offer, cta };
}

function channelCta(contract: OfficialConversionCopyContract, channel: OfficialAIChannel) {
  if (channel === "instagram") return `🔎 Veja a oferta no link da bio ou nos Stories. 👇`;
  if (channel === "facebook") return `👉 Veja a oferta no primeiro comentário. 👇`;
  if (channel === "telegram") return `📣 Ver oferta 👇`;
  return `👉 Ver oferta 👇`;
}

export function buildCopyV3ChannelCopy(facts: CopyV3Facts, channel: OfficialAIChannel, fields?: CopyV3Fields) {
  const contract = buildConversionCopyContract(facts, fields);
  const attribute = objectiveAttribute(facts);
  const marketplace = marketplaceLabel(facts.marketplace);
  const freight = shippingLine(facts);
  const product = channel === "whatsapp" ? contract.product : cleanProductName(facts.shortName?.trim() || facts.productName);
  const hookContainsProduct = semanticText(contract.hook).includes(semanticText(contract.product))
    || semanticNarrativeKey(contract.hook) === semanticNarrativeKey(contract.product);
  const commercial = [
    contract.hook,
    ...(hookContainsProduct ? [] : [`🛍️ ${product}`]),
    `${marketplace.icon} ${marketplace.text}`,
    ...(freight ? [freight] : []),
    ...(contract.benefit ? [`✨ ${contract.benefit}`] : []),
    ...(attribute && contract.benefit !== attribute.text ? [`✨ ${attribute.text}`] : []),
    ...(contract.offer ? [`💰 ${contract.offer}`] : [])
  ];
  const slots = deduplicateSemanticSlots(commercial, facts);

  if (channel === "instagram") return [...slots, channelCta(contract, channel), renderSocialHashtags(facts, "instagram")].filter(Boolean).join("\n\n");
  if (channel === "facebook") return [...slots, channelCta(contract, channel), renderSocialHashtags(facts, "facebook")].filter(Boolean).join("\n\n");
  return [...slots, channelCta(contract, channel)].join("\n\n");
}
