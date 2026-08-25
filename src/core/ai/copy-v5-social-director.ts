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
    hot_water: "Quem também usa água quente várias vezes ao dia?",
    kitchen: "Tem coisa que só vale espaço na cozinha quando facilita a rotina.",
    footwear: "Quem procura um calçado para usar de verdade no dia a dia sabe que só a foto não basta.",
    fashion: "Tem peça que chama atenção quando a gente imagina como ela entra no look, não quando fica parada na foto.",
    beauty: "Na rotina de beleza, o que mais conta é quando o produto faz sentido no uso do dia a dia.",
    pet: "Quem tem pet sabe: produto bom é o que encaixa na rotina do animal e do tutor.",
    tool: "Quando aparece uma tarefa chata, a ferramenta certa é o que separa improviso de praticidade.",
    electronics: "Tem eletrônico que chama atenção pela ficha técnica. E tem o que faz sentido quando entra na rotina.",
    cleaning: "Quem gosta de casa organizada sabe que praticidade pesa mais do que embalagem bonita.",
    generic: "Esse é o tipo de achado que vale olhar pelo uso real, não só pela foto.",
  };

  const instagram: Record<SocialCopyArchetype, string> = {
    hot_water: "Água quente no dia a dia sem transformar isso numa tarefa.",
    kitchen: "Praticidade de verdade é quando o produto entra na rotina sem complicar.",
    footwear: "O que importa é como ele fica em movimento — não parado na caixa.",
    fashion: "O desejo começa quando dá para imaginar a peça no corpo e em movimento.",
    beauty: "Produto de beleza faz mais sentido quando a gente consegue imaginar o ritual de uso.",
    pet: "Mais praticidade para a rotina de quem cuida de pet todos os dias.",
    tool: "Menos improviso. Mais facilidade para resolver a tarefa.",
    electronics: "Tecnologia boa é a que faz sentido quando entra na rotina.",
    cleaning: "Organização e praticidade aparecem no uso — não na embalagem.",
    generic: "Um achado que faz mais sentido quando você imagina usando no dia a dia.",
  };

  if (channel === "facebook") return facebook[archetype];
  if (channel === "instagram") return instagram[archetype];
  return instagram[archetype];
}

function priceSentence(facts: CopyV5Facts) {
  const discount = calculateDiscountPercent(facts.currentPrice, facts.originalPrice);
  if (facts.originalPrice && facts.originalPrice > facts.currentPrice) {
    return discount && discount >= 10
      ? `E o preço chamou atenção: de ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)} (${discount}% de desconto).`
      : `Hoje aparece de ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)}.`;
  }
  return `Hoje aparece por ${formatBRL(facts.currentPrice)}.`;
}

function attributeSentence(plan: CopyV5Plan) {
  const attributes = (plan.selectedAttributes ?? []).filter(Boolean).slice(0, 2);
  if (attributes.length === 0) return null;
  if (attributes.length === 1) return `Um detalhe informado na oferta: ${attributes[0].replace(/^[A-ZÁÉÍÓÚ]/u, (m) => m.toLowerCase())}.`;
  return `Entre os detalhes informados na oferta: ${attributes.join(" e ")}.`;
}

function productSentence(plan: CopyV5Plan, archetype: SocialCopyArchetype) {
  const name = plan.shortProductName;
  switch (archetype) {
    case "hot_water": return `A ${name} entra justamente nessa rotina de quem precisa ferver água com frequência.`;
    case "kitchen": return `O ${name} é um desses produtos feitos para entrar no preparo do dia a dia.`;
    case "footwear": return `O ${name} é para quem quer avaliar o produto pensando em caminhada, treino ou rotina real de uso.`;
    case "fashion": return `A proposta do ${name} faz mais sentido quando você pensa em caimento, movimento e combinação no dia a dia.`;
    case "beauty": return `O ${name} entra como opção para quem está olhando praticidade e uso real na rotina de beleza.`;
    case "pet": return `O ${name} entra como opção para a rotina do pet, onde uso e praticidade importam mais que promessa.`;
    case "tool": return `O ${name} entra como opção para quem quer resolver a tarefa com menos improviso.`;
    case "electronics": return `O ${name} merece ser avaliado pelo que entrega na rotina e pelos detalhes reais da oferta.`;
    case "cleaning": return `O ${name} entra como opção para facilitar uma tarefa doméstica sem transformar a copy em promessa milagrosa.`;
    default: return `O ${name} chamou atenção como uma opção para uso real no dia a dia.`;
  }
}

export function buildChannelNativeNarrative(
  plan: CopyV5Plan,
  facts: CopyV5Facts,
  channel: OfficialAIChannel,
) {
  const archetype = classifySocialCopyArchetype(facts);
  const lead = opening(archetype, channel);
  const product = productSentence(plan, archetype);
  const attribute = attributeSentence(plan);
  const price = priceSentence(facts);

  if (channel === "facebook") {
    return [
      lead,
      product,
      attribute,
      price,
      "Se você estava procurando algo assim, vale conferir os detalhes e o preço no primeiro comentário.",
    ].filter((line): line is string => Boolean(line));
  }

  if (channel === "instagram") {
    return [
      lead,
      product,
      attribute,
      price,
      "Quer ver os detalhes e confirmar se o preço continua assim? O link está na bio.",
    ].filter((line): line is string => Boolean(line));
  }

  if (channel === "whatsapp") {
    return [
      lead,
      product,
      attribute,
      price,
    ].filter((line): line is string => Boolean(line));
  }

  return [
    lead,
    product,
    price,
  ].filter((line): line is string => Boolean(line));
}
