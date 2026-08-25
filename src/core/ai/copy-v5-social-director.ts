import type { OfficialAIChannel } from "./types";
import type { CopyV5Facts, CopyV5Plan } from "./copy-v5-types";
import { calculateDiscountPercent, formatBRL } from "./copy-v5-validator";

export type SocialCopyArchetype =
  | "hot_water"
  | "kitchen"
  | "footwear"
  | "fashion"
  | "beauty"
  | "pet"
  | "tool"
  | "electronics"
  | "cleaning"
  | "generic";

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function classifySocialCopyArchetype(facts: CopyV5Facts): SocialCopyArchetype {
  const text = normalize(`${facts.category ?? ""} ${facts.productName}`);
  if (/(chaleira|fervedor|aquecedor de agua)/.test(text)) return "hot_water";
  if (/(sanduicheira|cafeteira|liquidificador|mixer|air fryer|fritadeira|panela|frigideira|cozinha)/.test(text)) return "kitchen";
  if (/(tenis|sapato|sandalia|bota|sapatilha|calcado)/.test(text)) return "footwear";
  if (/(vestido|camisa|camiseta|blusa|calca|short|saia|roupa|moda|vestuario)/.test(text)) return "fashion";
  if (/(maquiagem|batom|serum|creme|perfume|secador|chapinha|barbeador|aparador|beleza|cabelo)/.test(text)) return "beauty";
  if (/(pet|cachorro|gato|racao|tapete higienico|areia|comedouro|coleira)/.test(text)) return "pet";
  if (/(furadeira|parafusadeira|serra|lixadeira|ferramenta|martelete)/.test(text)) return "tool";
  if (/(notebook|smartphone|celular|fone|headset|monitor|teclado|mouse|console|tablet|tv|televisor)/.test(text)) return "electronics";
  if (/(organizador|mop|aspirador|limpeza|percarbonato|tira manchas|esponja)/.test(text)) return "cleaning";
  return "generic";
}

function opening(archetype: SocialCopyArchetype, channel: OfficialAIChannel) {
  const facebook: Record<SocialCopyArchetype, string> = {
    hot_water: "☕ Café, chá ou água quente sem complicar a rotina.",
    kitchen: "🍳 Mais praticidade no preparo do dia a dia.",
    footwear: "👟 Para quem quer conforto e uso real no dia a dia.",
    fashion: "✨ Uma peça para imaginar no look, não só na foto.",
    beauty: "💄 Um achado para encaixar na rotina de beleza.",
    pet: "🐾 Praticidade para quem cuida de pet todos os dias.",
    tool: "🛠️ Menos improviso para resolver a tarefa.",
    electronics: "⚡ Tecnologia que precisa fazer sentido na rotina.",
    cleaning: "🧽 Mais praticidade para cuidar da casa.",
    generic: "✨ Um achado para olhar pelo uso real.",
  };

  const instagram: Record<SocialCopyArchetype, string> = {
    hot_water: "☕ Um atalho simples para café, chá e água quente.",
    kitchen: "🍳 Praticidade que dá vontade de usar na cozinha.",
    footwear: "👟 O produto faz sentido quando entra em movimento.",
    fashion: "✨ O desejo começa quando você imagina no look.",
    beauty: "💄 Mais um item para deixar o ritual mais prático.",
    pet: "🐾 Um achado para facilitar a rotina com o pet.",
    tool: "🛠️ Resolver a tarefa com menos improviso.",
    electronics: "⚡ Tecnologia para uso real, sem enrolação.",
    cleaning: "🧽 Organização e praticidade no uso real.",
    generic: "✨ Um achado que faz sentido no dia a dia.",
  };

  if (channel === "facebook") return facebook[archetype];
  if (channel === "instagram") return instagram[archetype];
  return instagram[archetype];
}

function productLine(plan: CopyV5Plan) {
  const attributes = (plan.selectedAttributes ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 2);
  return attributes.length > 0
    ? `🔎 ${plan.shortProductName} • ${attributes.join(" • ")}`
    : `🔎 ${plan.shortProductName}`;
}

function priceLine(facts: CopyV5Facts) {
  const discount = calculateDiscountPercent(facts.currentPrice, facts.originalPrice);
  if (facts.originalPrice && facts.originalPrice > facts.currentPrice) {
    return discount !== null && discount >= 10
      ? `💰 De ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)} • ${discount}% OFF`
      : `💰 De ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)}`;
  }
  return `💰 ${formatBRL(facts.currentPrice)}`;
}

export function buildChannelNativeNarrative(
  plan: CopyV5Plan,
  facts: CopyV5Facts,
  channel: OfficialAIChannel,
) {
  const archetype = classifySocialCopyArchetype(facts);
  const lead = opening(archetype, channel);
  const product = productLine(plan);
  const price = priceLine(facts);

  if (channel === "facebook") {
    return [
      lead,
      product,
      price,
      "👉 Veja o preço, condições e disponibilidade no primeiro comentário.",
    ];
  }

  if (channel === "instagram") {
    return [
      lead,
      product,
      price,
      "👉 Veja o preço, condições e disponibilidade no link da bio.",
    ];
  }

  return [lead, product, price];
}
