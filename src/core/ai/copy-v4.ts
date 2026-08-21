import type { OfficialAIChannel } from "./types";

export type CopyV4CommercialAngle = "proof" | "saving" | "price" | "benefit" | "standard";

export interface CopyV4Facts {
  productName: string;
  shortName?: string | null;
  marketplace: string;
  category: string | null;
  currentPrice: number;
  originalPrice: number | null;
  evidence?: Record<string, unknown>;
  freeShipping?: boolean | null;
}

export interface ConversionCopyV4Contract {
  product: string;
  commercialAngle: CopyV4CommercialAngle;
  hook: string;
  benefitLine: string | null;
  proofLine: string | null;
  offerLine: string | null;
  cta: string;
}

function persistedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(persistedStrings);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, nested]) => [key, ...persistedStrings(nested)]);
  return [];
}

function semantic(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function compactProductName(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 64) return normalized;
  const cut = normalized.lastIndexOf(" ", 64);
  return (cut > 20 ? normalized.slice(0, cut) : normalized.slice(0, 64)).replace(/[\s,;:–—-]+$/gu, "");
}

function formatBRL(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function discountPercentage(currentPrice: number, originalPrice: number | null) {
  if (!(currentPrice > 0) || !originalPrice || originalPrice <= currentPrice) return null;
  return Math.round((1 - currentPrice / originalPrice) * 100);
}

function absoluteSaving(currentPrice: number, originalPrice: number | null) {
  if (!(currentPrice > 0) || !originalPrice || originalPrice <= currentPrice) return null;
  return originalPrice - currentPrice;
}

function productEmoji(facts: CopyV4Facts): string {
  const text = semantic(`${facts.category ?? ""} ${facts.productName}`);

  if (/ar condicionado|climatizador|ventilador|freezer|geladeira|refrigerador|inverter/iu.test(text)) return "❄️";
  if (/smartphone|celular|iphone|galaxy|redmi|xiaomi|poco|motorola|realme/iu.test(text)) return "📱";
  if (/fone|headset|headphone|earbuds|airpods|audio/iu.test(text)) return "🎧";
  if (/notebook|laptop|macbook|chromebook|computador|pc gamer|desktop/iu.test(text)) return "💻";
  if (/smartwatch|relogio|watch|smartband/iu.test(text)) return "⌚";
  if (/tv|smart tv|televisao|televisor|monitor/iu.test(text)) return "📺";
  if (/camera|webcam|filmadora|gopro/iu.test(text)) return "📷";
  if (/console|videogame|playstation|ps5|ps4|xbox|nintendo|switch/iu.test(text)) return "🎮";
  if (/mochila|bolsa|mala|carteira|estojo|necessaire/iu.test(text)) return "🎒";
  if (/tenis|sapato|calcado|chuteira|sandalia|chinelo|bota/iu.test(text)) return "👟";
  if (/camiseta|camisa|jaqueta|casaco|moletom|vestido|calca|bermuda|roupa|short/iu.test(text)) return "👕";
  if (/perfume|desodorante|hidratante|skincare|maquiagem|batom|shampoo|condicionador|sabonete|beleza|cosmetico/iu.test(text)) return "✨";
  if (/cafe|cafeteira|espresso|nespresso|garrafa termica|caneca|copo termico/iu.test(text)) return "☕";
  if (/fritadeira|air fryer|airfryer|panela|liquidificador|batedeira|micro ondas|fogao|cooktop|cozinha|mixer/iu.test(text)) return "🍳";
  if (/aspirador|robo aspirador|limpeza|sabao|amaciante|lava e seca|lava loucas|mop/iu.test(text)) return "🧹";
  if (/ferramenta|furadeira|parafusadeira|serra|trena|chave|maleta de ferramentas/iu.test(text)) return "🔧";
  if (/livro|ebook|kindle|box de livros/iu.test(text)) return "📚";
  if (/suplemento|whey|creatina|vitamina|proteina|barra de proteina/iu.test(text)) return "💪";
  if (/pet|racao|tapete higienico|arranhador|gato|cachorro|petisco/iu.test(text)) return "🐾";
  if (/bicicleta|bike|patinete|ciclismo|capacete ciclista/iu.test(text)) return "🚲";
  if (/carro|automotivo|pneu|oleo motor|palheta/iu.test(text)) return "🚗";
  if (/brinquedo|lego|boneco|boneca|jogos de tabuleiro/iu.test(text)) return "🧸";

  return "🔥";
}

function proofFromEvidence(facts: CopyV4Facts): string | null {
  const evidenceText = persistedStrings(facts.evidence ?? {}).join(" | ");
  const normalized = semantic(evidenceText);

  const ratingMatch = evidenceText.match(/(?:rating|avalia[cç][aã]o)[^\d]{0,10}(\d(?:[.,]\d)?)/iu);
  if (ratingMatch) {
    const ratingNum = Number(ratingMatch[1].replace(",", "."));
    if (ratingNum >= 4 && ratingNum <= 5) {
      const formatted = Number.isInteger(ratingNum)
        ? `${ratingNum}/5`
        : `${ratingNum.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5`;
      return `Avaliação ${formatted} no marketplace.`;
    }
  }

  const positionMatch = evidenceText.match(/(?:BEST[_\s-]?SELLER|mais\s+vendid[oa]|bestseller)[^\d#]{0,24}#?\s*(\d{1,3})/iu)
    ?? evidenceText.match(/(?:pos(?:ition|icao|ição)?)[^\d]{0,8}#?\s*(\d{1,3})/iu);
  if (positionMatch && /best seller|bestseller|mais vendido/iu.test(normalized)) {
    return `Top #${positionMatch[1]} entre os mais vendidos no marketplace.`;
  }
  if (/best seller|bestseller|mais vendido/iu.test(normalized)) {
    return "Entre os mais vendidos no marketplace.";
  }

  if (/loja oficial|official store|official_store/iu.test(evidenceText)) {
    return "Loja oficial identificada no marketplace.";
  }
  if (/\bmall\b/iu.test(evidenceText)) {
    return "Selo Mall identificado no marketplace.";
  }

  return null;
}

function benefitFromFacts(facts: CopyV4Facts): string | null {
  const text = `${facts.productName} ${persistedStrings(facts.evidence ?? {}).join(" ")}`;
  const sem = semantic(text);

  if (/ar condicionado|climatizador/iu.test(sem)) {
    const inverter = /inverter/iu.test(text) ? "Inverter" : null;
    const btuMatch = text.match(/\b(\d{4,5})\s*btus?\b/iu);
    const btu = btuMatch ? `${btuMatch[1]} BTUs` : null;
    const ciclo = /quente\s*(?:e|\/)\s*frio/iu.test(text) ? "quente e frio" : /frio/iu.test(text) ? "frio" : null;
    const voltMatch = text.match(/\b(110v|127v|220v|bivolt)\b/iu);
    const volt = voltMatch ? (voltMatch[1].toLowerCase() === "bivolt" ? "bivolt" : voltMatch[1].toUpperCase()) : null;

    const parts = [
      inverter ? `um modelo ${inverter}` : "um modelo de ar-condicionado",
      btu ? `de ${btu}` : null,
      ciclo,
      volt,
    ].filter(Boolean);

    if (parts.length >= 2) {
      const firstTwo = parts.slice(0, 2).join(" ");
      const rest = parts.slice(2);
      if (rest.length > 0) {
        return `Boa opção para quem está procurando ${firstTwo}, ${rest.join(" e ")}.`;
      }
      return `Boa opção para quem está procurando ${firstTwo}.`;
    }
    return "Boa opção para quem está procurando climatizar o ambiente com praticidade.";
  }

  if (/notebook|laptop|macbook/iu.test(sem)) {
    const ramMatch = text.match(/\b(\d{1,2}\s*gb)\s*ram\b/iu) ?? text.match(/\b(\d{1,2}gb)\s*ram\b/iu);
    const ssdMatch = text.match(/\b(ssd\s*de\s*\d+\s*(?:gb|tb)|\d+\s*(?:gb|tb)\s*ssd)\b/iu);
    if (ramMatch && ssdMatch) {
      return `Boa opção para quem quer um notebook com ${ramMatch[1].toUpperCase()} de RAM e ${ssdMatch[1].toUpperCase()}.`;
    }
    if (ramMatch) return `Boa opção para quem quer um notebook com ${ramMatch[1].toUpperCase()} para estudos e trabalho.`;
    return "Boa opção para quem está procurando um notebook para o dia a dia.";
  }

  if (/fone|headset|headphone|earbuds/iu.test(sem)) {
    const isBt = /bluetooth/iu.test(text);
    const isWireless = /sem\s+fio/iu.test(text);
    if (isBt && isWireless) return "Boa opção para quem está procurando um fone Bluetooth sem fio.";
    if (isBt) return "Boa opção para quem está procurando um fone Bluetooth prático.";
    if (isWireless) return "Boa opção para quem procura um fone sem fio para o dia a dia.";
    return "Boa opção para quem procura um fone confortável para ouvir músicas e chamadas.";
  }

  if (/air\s*fryer|airfryer|fritadeira/iu.test(sem)) {
    const capMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:litros?|l)\b/iu);
    if (capMatch) {
      const cap = capMatch[1].replace(",", ".");
      return `Boa opção para quem procura uma air fryer de ${cap} litros.`;
    }
    return "Boa opção para quem procura uma air fryer prática para a cozinha.";
  }

  if (/mochila/iu.test(sem)) {
    const isWaterproof = /à\s+prova\s+d['’]água|imperme[aá]vel/iu.test(text);
    const isExpansivel = /expans[ií]vel/iu.test(text);
    const isReforcada = /refor[cç]ada/iu.test(text);
    if (isWaterproof && isExpansivel) {
      return "Boa opção para quem procura uma mochila com Proteção contra água e formato expansível.";
    }
    if (isWaterproof) return "Boa opção para quem procura uma mochila com Proteção contra água para o dia a dia.";
    if (isExpansivel) return "Boa opção para quem precisa de uma mochila espaçosa e expansível.";
    if (isReforcada) return "Boa opção para quem busca uma mochila reforçada e resistente.";
    return "Boa opção para quem procura uma mochila prática para o dia a dia.";
  }

  if (/smartphone|celular|iphone|galaxy/iu.test(sem)) {
    const storageMatch = text.match(/\b(64|128|256|512)\s*gb\b/iu);
    const is5g = /\b5g\b/iu.test(text);
    if (storageMatch && is5g) return `Boa opção para quem procura um smartphone 5G com ${storageMatch[1]} GB de memória.`;
    if (storageMatch) return `Boa opção para quem procura um smartphone com ${storageMatch[1]} GB de armazenamento.`;
    if (is5g) return "Boa opção para quem quer um smartphone 5G moderno e rápido.";
    return "Boa opção para quem procura um smartphone completo para o dia a dia.";
  }

  if (/cooktop|fogao|panela|liquidificador|batedeira/iu.test(sem)) {
    const bocasMatch = text.match(/\b(\d)\s*bocas?\b/iu);
    if (bocasMatch) return `Boa opção para quem está procurando um modelo de ${bocasMatch[1]} bocas para a cozinha.`;
    return "Boa opção para quem quer renovar os itens da cozinha.";
  }

  if (/à\s+prova\s+d['’]água|imperme[aá]vel/iu.test(text)) {
    return "Boa opção para quem procura um produto com Proteção contra água.";
  }
  if (/expans[ií]vel/iu.test(text)) {
    return "Boa opção para quem precisa de mais espaço e formato expansível.";
  }
  if (/recarreg[aá]vel/iu.test(text)) {
    return "Boa opção para quem prefere a praticidade de um modelo recarregável.";
  }
  if (/port[aá]til/iu.test(text)) {
    return "Boa opção para quem procura um modelo portátil e fácil de transportar.";
  }
  if (/bivolt/iu.test(text)) {
    return "Boa opção para quem busca a flexibilidade de um produto bivolt.";
  }
  if (/sem\s+fio/iu.test(text)) {
    return "Boa opção para quem quer a liberdade do uso sem fio.";
  }
  if (/bluetooth/iu.test(text)) {
    return "Boa opção para quem busca a praticidade da conexão Bluetooth.";
  }

  return null;
}

function offerLine(facts: CopyV4Facts): string | null {
  if (!(facts.currentPrice > 0) || !facts.originalPrice || facts.originalPrice <= facts.currentPrice) {
    return null;
  }
  const saving = absoluteSaving(facts.currentPrice, facts.originalPrice);
  if (saving !== null && saving > 0) {
    return `Economia de ${formatBRL(saving)}.`;
  }
  return null;
}

function resolveCommercialAngle(facts: CopyV4Facts, proofLine: string | null, benefitLine: string | null): CopyV4CommercialAngle {
  const saving = absoluteSaving(facts.currentPrice, facts.originalPrice);
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  if (proofLine) return "proof";
  if (saving !== null && discount !== null && (discount >= 20 || saving >= 30)) return "saving";
  if (facts.currentPrice > 0 && facts.currentPrice < 100) return "price";
  if (benefitLine) return "benefit";
  return "standard";
}

function hookFor(facts: CopyV4Facts): string {
  const emoji = productEmoji(facts);
  const product = compactProductName(facts.shortName?.trim() || facts.productName);

  if (facts.currentPrice > 0) {
    const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
    if (discount !== null && facts.originalPrice !== null && discount >= 5) {
      return `${emoji} ${product} de ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)} — ${discount}% OFF`;
    }
    return `${emoji} ${product} por ${formatBRL(facts.currentPrice)}`;
  }

  return `${emoji} ${product}`;
}

function channelCta(channel: OfficialAIChannel) {
  if (channel === "facebook") return "👉 Conferir o preço atual no primeiro comentário. 👇";
  if (channel === "instagram") return "🔎 Conferir o preço atual no link da bio. 👇";
  return "👉 Conferir o preço atual 👇";
}

export function buildConversionCopyV4Contract(facts: CopyV4Facts, channel: OfficialAIChannel): ConversionCopyV4Contract {
  const product = compactProductName(facts.shortName?.trim() || facts.productName);
  const proofLine = proofFromEvidence(facts);
  const benefitLine = benefitFromFacts(facts);
  const commercialAngle = resolveCommercialAngle(facts, proofLine, benefitLine);
  return {
    product,
    commercialAngle,
    hook: hookFor(facts),
    benefitLine,
    proofLine,
    offerLine: offerLine(facts),
    cta: channelCta(channel),
  };
}

export function buildCopyV4ChannelCopy(facts: CopyV4Facts, channel: OfficialAIChannel) {
  const contract = buildConversionCopyV4Contract(facts, channel);
  const blocks = [
    contract.hook,
    contract.proofLine ? `⭐ ${contract.proofLine}` : null,
    contract.benefitLine,
    facts.freeShipping === true ? "🚚 Frete grátis confirmado." : null,
    contract.offerLine ? `💰 ${contract.offerLine}` : null,
    contract.cta,
  ].filter((value): value is string => Boolean(value));

  const seen = new Set<string>();
  return blocks.filter((block) => {
    const key = semantic(block);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join("\n\n");
}
