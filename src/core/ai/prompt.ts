import type { OfficialAIChannel, OfficialAIDraftForRegeneration, OfficialAIOffer } from "./types";
import { marketplaceLabel, selectOfferIcons } from "./icon-catalog";
import { renderSocialHashtags } from "./social-hashtags";

const SYSTEM_PROMPT = `Você é o copywriter de ofertas da Official AI do Caça Oferta.
Você não conversa, não introduz a mensagem e não escreve parágrafos. Produza somente copy comercial curta no framework O.P.A.C.: Oferta, Produto, Atributo e Conversão.

Regras obrigatórias:
- Gere somente um gancho curto no campo hook (ou hooks por canal). Nunca gere produto, preço, desconto, atributo, CTA, hashtags ou URL.
- O gancho (hook) deve focar no produto ou em um benefício explicitamente comprovado nos dados. Só mencione urgência, prazo ou escassez quando houver evidência persistida para isso.
- O gancho não pode passar de 90 caracteres.
- Escreva como uma recomendação curta de uma pessoa: varie a abertura, evite repetir “oferta” e “achado” em toda mensagem e prefira o benefício comercial comprovado.
- Use somente fatos presentes nos dados de entrada. Nunca invente preço, desconto, frete, cupom, estoque, parcelamento, marca, especificação, atributo ou benefício.
- O atributo deve existir literalmente no título, nos atributos estruturados persistidos ou nos metadados persistidos. Nunca infira ou deduza atributo. Se não existir, omita a linha.
- Nunca escreva: Olá, Nova chegada, Temos um novo, Você vai amar, Confira, Não perca, Imperdível, Produto incrível, Compre agora, Aproveite enquanto durar, Essa oportunidade é única, Só agora, Corre que, estoque acaba ou antes que o preço suba.
- Nunca inclua URL, [link] ou qualquer placeholder. A persistência anexará exatamente um link rastreado.
- Responda somente JSON válido com todos os campos solicitados. Não retorne estados, aprovação, publicação nem instruções operacionais.`;

function buildCopyV2Prompt(input: Record<string, unknown>) {
  const channels = (input.channels ?? [input.channel]) as readonly OfficialAIChannel[];
  return {
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      ...input,
      outputContract: {
        hook: "Gancho curto (MÁXIMO 80 caracteres). NENHUMA quebra de linha. NENHUMA palavra proibida (Olá, Confira, etc)."
      },
      formatting: "Retorne exatamente esse objeto JSON, sem markdown. Formate valores em reais com duas casas decimais."
    })
  };
}

function discountPercentage(currentPrice: number, originalPrice: number | null) {
  if (!originalPrice || originalPrice <= currentPrice) return null;
  return Math.round((1 - currentPrice / originalPrice) * 100);
}

export interface CopyV2Facts {
  productName: string;
  marketplace: string;
  category: string | null;
  currentPrice: number;
  originalPrice: number | null;
  evidence?: Record<string, unknown>;
  freeShipping?: boolean | null;
}

const ATTRIBUTE_PATTERNS = [
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
      if (match) return { text: match.replace(/\s+/gu, " ").trim(), emoji: candidate.emoji };
    }
  }
  return null;
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
  if (cleaned.length <= 76) return cleaned;
  const cut = cleaned.lastIndexOf(" ", 76);
  return cut > 0 ? cleaned.slice(0, cut) : words[0];
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

/**
 * Normaliza hooks legados ou promocionais sem evidência persistida.
 * A copy continua aproveitável; apenas remove urgência/escassez não comprovada.
 */
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
  
  if (!facts.currentPrice || facts.currentPrice <= 0) {
    const market = facts.marketplace || 'Shopee';
    const isFeminine = /shopee|amazon|shein/i.test(market);
    const inMarket = isFeminine ? "na" : "no";
    return `✨ Oferta em destaque ${inMarket} ${market}`;
  }

  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  const saving = facts.originalPrice && facts.originalPrice > facts.currentPrice
    ? formatBRL(facts.originalPrice - facts.currentPrice)
    : null;
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
  const icons = selectOfferIcons(facts.category, facts.productName);
  const marketplace = marketplaceLabel(facts.marketplace);
  const iconLine = icons.length > 0 ? icons.map((icon) => icon.emoji).join(" ") : "🛍️";
  const freight = shippingLine(facts);

  if (channel === "facebook") {
    const blocks = [
      hookFor(facts, hook),
      `🛍️ ${cleanProductName(facts.productName)}`,
      `${iconLine} ${marketplace.text}`,
      ...(freight ? [freight] : []),
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      discount && facts.originalPrice && facts.currentPrice > 0
        ? `📉 De ${formatBRL(facts.originalPrice)}\n💰 Por *${formatBRL(facts.currentPrice)}* (${discount}% OFF)`
        : (facts.currentPrice > 0 ? `💰 ${formatBRL(facts.currentPrice)}` : `💰 Consulte o preço atual no link!`),
      `👉 Link de compra no primeiro comentário! 👇`,
      renderSocialHashtags(facts, "facebook")
    ];
    return blocks.join("\n\n");
  }

  if (channel === "whatsapp") {
    const blocks = [
      hookFor(facts, hook),
      `🛍️ ${cleanProductName(facts.productName)}`,
      `${iconLine} ${marketplace.text}`,
      ...(freight ? [freight] : []),
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      ...(discount !== null && facts.originalPrice !== null && facts.currentPrice > 0 ? [`❌ *Preço anterior: ${formatBRL(facts.originalPrice)}*`] : []),
      facts.currentPrice > 0 ? `✅ *Valor confirmado: ${formatBRL(facts.currentPrice)}* ${discount ? `(${discount}% OFF)` : ''}`.trim() : `✅ Consulte o valor no link!`,
      `👉 `
    ];
    return blocks.join("\n\n");
  }

  if (channel === "telegram") {
    const blocks = [
      hookFor(facts, hook),
      `🛍️ ${cleanProductName(facts.productName)}`,
      `${iconLine} ${marketplace.text}`,
      ...(freight ? [freight] : []),
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      discount && facts.originalPrice && facts.currentPrice > 0
        ? `📉 De ${formatBRL(facts.originalPrice)}\n💰 Por *${formatBRL(facts.currentPrice)}* (${discount}% OFF)`
        : (facts.currentPrice > 0 ? `💰 *${formatBRL(facts.currentPrice)}*` : `💰 Consulte o preço atual no link!`),
      `👉 `
    ];
    return blocks.join("\n\n");
  }

  if (channel === "instagram") {
    const hasPrice = facts.currentPrice && facts.currentPrice > 0;
    const blocks = [
      hookFor(facts, hook),
      `${humanContext(facts) ?? "Uma opção para sua rotina"}: **${cleanProductName(facts.productName)}**.`,
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      ...(freight ? [freight] : []),
      hasPrice
        ? (discount ? `📉 Economia verificada de **${discount}%** sobre o preço anterior.` : null)
        : `💰 Consulte o preço atual no anúncio.`,
      hasPrice
        ? (discount && facts.originalPrice
            ? `💰 **De ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)}**`
            : `💰 **Apenas ${formatBRL(facts.currentPrice)}**`)
        : null,
      `🔎 **Link na bio ou nos Stories para consultar a oferta.** 👇`,
      renderSocialHashtags(facts, "instagram")
    ].filter(Boolean);
    return blocks.join("\n\n");
  }

  if (channel === "facebook") {
    const blocks = [
      hookFor(facts, hook),
      `🛍️ ${cleanProductName(facts.productName)}`,
      `${iconLine} ${marketplace.text}`,
      ...(freight ? [freight] : []),
      ...(attribute ? [`✨ ${attribute.text}`] : []),
      discount && facts.originalPrice
        ? `📉 De ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)} (${discount}% OFF)`
        : `💰 ${formatBRL(facts.currentPrice)}`,
      `👉 `
    ];
    return blocks.join("\n\n");
  }

  // Fallback
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
  return buildCopyV2Prompt({
    task: "Crie copy O.P.A.C. independente para cada canal solicitado.",
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
    required: [
      "hook"
    ]
  });
}

export function buildOfficialRegenerationPrompt(draft: OfficialAIDraftForRegeneration) {
  return buildCopyV2Prompt({
    task: "Gere somente um gancho curto para este draft.",
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
    required: [
      "hook"
    ]
  });
}
