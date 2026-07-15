import type { OfficialAIChannel, OfficialAIDraftForRegeneration, OfficialAIOffer } from "./types";

const SYSTEM_PROMPT = `Você é o copywriter especializado em ofertas da Official AI do Caça Oferta, com domínio de marketing digital e e-commerce.
Você não conversa, não atende clientes e não escreve mensagens genéricas. Produza copys comerciais curtas, objetivas, persuasivas e escaneáveis.

Regras obrigatórias:
- Use somente fatos presentes nos dados de entrada. Nunca invente preço, desconto, parcelamento, frete, estoque, marca, especificação ou benefício.
- Se um dado não existir, omita-o.
- Priorize, quando disponíveis: produto, preço atual, preço anterior, desconto calculado, marketplace, benefício comprovado, categoria, marca comprovada, oportunidade e CTA.
- Use urgência natural, sem exagero, spam ou clickbait.
- Nunca comece com "Olá", "Temos um novo", "Você vai amar", "Confira", "Conheça" ou "Não perca".
- WhatsApp: curto, escaneável, emojis moderados e CTA forte.
- Telegram: mais rico, informativo e pode usar bullets.
- Instagram: comercial, visual e com frases curtas.
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
        hashtags: ["ao menos uma hashtag relevante"],
        callToAction: "string não vazia",
        highlights: ["ao menos um fato da entrada"],
        explanation: "string curta explicando os fatos usados",
        channelCopies: Object.fromEntries(channels.map((channel) => [channel, "copy final sem URL e sem placeholder"]))
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
}

const formatBRL = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function buildCopyV2ChannelCopy(facts: CopyV2Facts, channel: OfficialAIChannel) {
  const price = formatBRL(facts.currentPrice);
  const previous = facts.originalPrice && facts.originalPrice > facts.currentPrice
    ? `\n📉 De ${formatBRL(facts.originalPrice)}${discountPercentage(facts.currentPrice, facts.originalPrice) === null ? "" : ` (${discountPercentage(facts.currentPrice, facts.originalPrice)}% OFF)`}`
    : "";
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  const category = facts.category && !/^cat:/iu.test(facts.category) ? `\n• Categoria: ${facts.category}` : "";
  const marketplace = facts.marketplace.toLocaleUpperCase("pt-BR");

  if (channel === "whatsapp") {
    return `🔥 ACHADINHO ${marketplace}\n\n🛍️ *${facts.productName}*\n\n💰 ${price}${previous}\n\n🛒 Garanta o seu:\n\n👉`;
  }
  if (channel === "telegram") {
    return `🔥 OFERTA ${marketplace}\n\n🛍️ ${facts.productName}\n\n💰 ${price}${previous}\n• Marketplace: ${facts.marketplace}${category}\n\n🛒 Aproveite a oferta:\n\n👉`;
  }
  const marketplaceTag = facts.marketplace.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "");
  return `🔥 OFERTA EM DESTAQUE\n\n🛍️ ${facts.productName}\n\n💰 ${price}${previous}\n📍 ${facts.marketplace}${category}\n\n🛒 Aproveite.\n\n#oferta #${marketplaceTag}\n\n👉`;
}

export function buildOfficialPrompt(offer: OfficialAIOffer, channels: readonly OfficialAIChannel[]) {
  return buildCopyV2Prompt({
      task: "Crie Copy V2 independente para cada canal solicitado.",
      product: {
        title: offer.productName,
        marketplace: offer.marketplace,
        category: offer.category,
        currentPrice: offer.currentPrice,
        originalPrice: offer.originalPrice,
        discountPercentage: discountPercentage(offer.currentPrice, offer.originalPrice)
      },
      channels,
      channelGuidance: {
        whatsapp: "Texto curto, escaneável, emojis moderados, preço em destaque e CTA forte.",
        telegram: "Texto mais rico; bullets permitidos; inclua mais fatos úteis sem alongar demais.",
        instagram: "Copy comercial com impacto visual e frases curtas. Hashtags somente no campo hashtags."
      },
      required: [
        "title", "description", "shortCopy", "longCopy", "hashtags", "callToAction",
        "highlights", "explanation", "channelCopies"
      ]
  });
}

export function buildOfficialRegenerationPrompt(draft: OfficialAIDraftForRegeneration) {
  return buildCopyV2Prompt({
      task: "Reescreva completamente a copy deste draft existente usando Copy V2.",
      channel: draft.channel,
      product: {
        title: draft.productName,
        marketplace: draft.marketplace,
        category: draft.category,
        currentPrice: draft.currentPrice,
        originalPrice: draft.originalPrice,
        discountPercentage: discountPercentage(draft.currentPrice, draft.originalPrice),
        shippingFree: draft.shippingFree,
        rating: draft.rating,
        coupon: draft.coupon
      },
      linkRule: "NÃO inclua URL ou link na resposta; o sistema anexará o link rastreado existente.",
      required: [
        "title", "description", "shortCopy", "longCopy", "hashtags", "callToAction",
        "highlights", "explanation", "channelCopies"
      ]
  });
}
