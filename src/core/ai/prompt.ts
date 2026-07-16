import type { OfficialAIChannel, OfficialAIDraftForRegeneration, OfficialAIOffer } from "./types";

const SYSTEM_PROMPT = `Você é o copywriter de ofertas da Official AI do Caça Oferta.
Você não conversa, não introduz a mensagem e não escreve parágrafos. Produza somente copy comercial curta no framework O.P.A.C.: Oferta, Produto, Atributo e Conversão.

Regras obrigatórias:
- Use somente fatos presentes nos dados de entrada. Nunca invente preço, desconto, frete, cupom, estoque, parcelamento, marca, especificação, atributo ou benefício.
- O atributo deve existir literalmente no título, nos atributos estruturados persistidos ou nos metadados persistidos. Nunca infira ou deduza atributo. Se não existir, omita a linha.
- Use 4 a 7 blocos curtos e no máximo 4 emojis.
- Comece com uma oferta factual. Sem evidência específica, use "🔥 OFERTA <MARKETPLACE>".
- Mostre produto e preço imediatamente. Mostre preço anterior e desconto somente quando os valores válidos permitirem o cálculo.
- Termine com CTA de no máximo três palavras: "Ver oferta", "Comprar", "Aproveitar oferta" ou "Garanta o seu".
- WhatsApp: mais curto, sem hashtags e CTA direto.
- Telegram: blocos curtos, preço anterior permitido e sem hashtags desnecessárias.
- Instagram: impacto visual e poucas hashtags relevantes; nunca posicione link no meio da copy.
- Nunca escreva: Olá, Nova chegada, Temos um novo, Você vai amar, Confira, Não perca, Imperdível, Produto incrível, Compre agora, Aproveite enquanto durar ou Essa oportunidade é única.
- Nunca inclua URL, [link] ou qualquer placeholder. A persistência anexará exatamente um link rastreado.
- Responda somente JSON válido com todos os campos solicitados. Não retorne estados, aprovação, publicação nem instruções operacionais.`;

function buildCopyV2Prompt(input: Record<string, unknown>) {
  const channels = (input.channels ?? [input.channel]) as readonly OfficialAIChannel[];
  return {
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      ...input,
      outputContract: {
        title: "string não vazia",
        description: "string não vazia",
        shortCopy: "string não vazia",
        longCopy: "string não vazia",
        hashtags: ["hashtags relevantes somente para Instagram"],
        callToAction: "CTA com no máximo três palavras",
        highlights: ["somente fatos da entrada"],
        explanation: "string curta explicando os fatos usados",
        channelCopies: Object.fromEntries(channels.map((channel) => [channel, "copy final sem URL e sem placeholder no padrão O.P.A.C."]))
      },
      formatting: "Retorne exatamente esse objeto JSON, sem markdown. Formate valores em reais com duas casas decimais."
    })
  };
}

function discountPercentage(currentPrice: number, originalPrice: number | null) {
  if (!originalPrice || originalPrice <= currentPrice) return null;
  return Math.round((1 - currentPrice / originalPrice) * 100);
}

interface CopyV2Facts {
  productName: string;
  marketplace: string;
  category: string | null;
  currentPrice: number;
  originalPrice: number | null;
  evidence?: Record<string, unknown>;
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
  return value
    .replace(/^\s*(?:oferta|promoção|achadinho)\s*[:\-–—]\s*/iu, "")
    .replace(/\s*[|•]\s*(?:shopee|amazon|mercado livre)\s*$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function buildCopyV2ChannelCopy(facts: CopyV2Facts, channel: OfficialAIChannel) {
  const marketplace = facts.marketplace.replace(/\s+/gu, " ").trim().toLocaleUpperCase("pt-BR");
  const priceBlock = [`💰 ${formatBRL(facts.currentPrice)}`];
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  if (discount !== null && facts.originalPrice !== null) {
    priceBlock.push(`📉 De ${formatBRL(facts.originalPrice)} — ${discount}% OFF`);
  }

  const attribute = objectiveAttribute(facts);
  const blocks = [
    `🔥 OFERTA ${marketplace}`,
    cleanProductName(facts.productName),
    priceBlock.join("\n")
  ];
  if (attribute) blocks.push(`${discount === null ? `${attribute.emoji} ` : ""}${attribute.text}`);
  if (channel === "instagram") {
    const marketplaceTag = facts.marketplace.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]/giu, "").toLocaleLowerCase("pt-BR");
    blocks.push(`#oferta #${marketplaceTag}`);
  }
  blocks.push("👉 Ver oferta");
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
      instagram: "Impacto visual, poucas hashtags relevantes e nenhuma URL."
    },
    required: [
      "title", "description", "shortCopy", "longCopy", "hashtags", "callToAction",
      "highlights", "explanation", "channelCopies"
    ]
  });
}

export function buildOfficialRegenerationPrompt(draft: OfficialAIDraftForRegeneration) {
  return buildCopyV2Prompt({
    task: "Reescreva completamente este draft no padrão O.P.A.C.",
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
      "title", "description", "shortCopy", "longCopy", "hashtags", "callToAction",
      "highlights", "explanation", "channelCopies"
    ]
  });
}
