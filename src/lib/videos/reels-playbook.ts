export type ReelsPromptOffer = {
  id: string;
  product_name: string;
  platform: string;
  current_price: number;
  old_price?: number | null;
  image_url?: string | null;
  category?: string | null;
};

export type ReelsPromptScene = {
  number: 1 | 2;
  durationSeconds: 10;
  purpose: string;
  prompt: string;
  avatarSpeech: string;
  overlayText: string;
};

export type ReelsPromptPlan = {
  niche: string;
  angle: string;
  cta: string;
  referenceImageUrl: string | null;
  scenes: readonly [ReelsPromptScene, ReelsPromptScene];
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function discountPercent(current: number, oldPrice?: number | null) {
  if (!oldPrice || oldPrice <= current || current <= 0) return null;
  return Math.round(((oldPrice - current) / oldPrice) * 100);
}

function classifyNiche(offer: ReelsPromptOffer) {
  const text = normalize(`${offer.category ?? ""} ${offer.product_name}`);
  if (/(cozinha|casa|panela|sanduicheira|cafeteira|chaleira|mixer|organizador|gaveta|armario)/.test(text)) {
    return { niche: "Casa/Cozinha/Organização", setting: "cozinha residencial contemporânea, acolhedora e realista", angle: "praticidade + desejo de uso no dia a dia" };
  }
  if (/(beleza|secador|chapinha|escova|maquiagem|cabelo)/.test(text)) {
    return { niche: "Beleza", setting: "penteadeira ou banheiro elegante, iluminado e realista", angle: "resultado visual + praticidade" };
  }
  if (/(pet|gato|cachorro|cao|areia|tapete higienico|racao)/.test(text)) {
    return { niche: "Pet", setting: "sala de casa organizada e acolhedora com contexto pet", angle: "cuidado + praticidade + economia" };
  }
  if (/(tenis|roupa|moda|bolsa|camisa|vestido)/.test(text)) {
    return { niche: "Moda", setting: "ambiente lifestyle clean, elegante e cotidiano", angle: "estilo + custo-benefício" };
  }
  if (/(furadeira|parafusadeira|serra|ferramenta)/.test(text)) {
    return { niche: "Ferramentas", setting: "oficina ou garagem organizada e realista", angle: "problema resolvido + eficiência" };
  }
  return { niche: "Geral", setting: "ambiente doméstico realista e coerente com o produto", angle: "benefício principal + oportunidade" };
}

function buildPrompt({ sceneNumber, setting, productName, speech, overlayText, action }: {
  sceneNumber: 1 | 2;
  setting: string;
  productName: string;
  speech: string;
  overlayText: string;
  action: string;
}) {
  const continuity = sceneNumber === 1
    ? "Estabeleça o avatar e o cenário que deverão ser preservados na Cena 2."
    : "Esta é uma continuação direta da Cena 1: preserve exatamente o mesmo avatar, rosto, idade aparente, cabelo, roupa, acessórios, iluminação, cenário, posição relativa do produto e linguagem de câmera.";

  return [
    `Crie a Cena ${sceneNumber} de um Reel de venda com duração exata de 10 segundos, vertical 9:16, estilo hiper-realista, cinematográfico e natural.`,
    `Cenário: ${setting}.`,
    `Produto de referência: ${productName}. Use a imagem fornecida como fonte visual principal e preserve marca, formato, cor, proporções e detalhes reconhecíveis. Não redesenhe o produto e não invente acessórios ou funções.`,
    continuity,
    "Avatar: hiper-realista, aparência humana natural, gestos discretos, expressão convincente, contato visual com a câmera e sincronização labial coerente com a fala.",
    `Ação da cena: ${action}`,
    `FALA EXATA DO AVATAR, em português do Brasil, tom natural e vendedor sem exagero: “${speech}”`,
    `TEXTO NA TELA: “${overlayText}”. Não inserir outros preços, selos, cupons, porcentagens ou textos promocionais que não tenham sido informados.`,
    "Áudio limpo, voz em primeiro plano. Evite cortes bruscos, mãos deformadas, produto duplicado, marca alterada, texto ilegível ou movimentos artificiais.",
  ].join("\n");
}

export function buildTwoSceneReelsPlan(offer: ReelsPromptOffer): ReelsPromptPlan {
  const profile = classifyNiche(offer);
  const price = brl(offer.current_price);
  const discount = discountPercent(offer.current_price, offer.old_price);
  const cta = "Confira o preço e a disponibilidade antes que a oferta mude.";

  const scene1Speech = `Se você gosta de deixar a rotina mais prática, olha esse achado: ${offer.product_name}.`;
  const scene1Overlay = "Achado que faz sentido no dia a dia";
  const scene2Speech = discount
    ? `E o que chamou atenção foi o preço: caiu de ${brl(offer.old_price!)} para ${price}. Confira enquanto estiver assim.`
    : `Hoje ele aparece por ${price}. Confira o preço e a disponibilidade antes que mude.`;
  const scene2Overlay = discount ? `${discount}% OFF • ${price}` : price;

  return {
    niche: profile.niche,
    angle: profile.angle,
    cta,
    referenceImageUrl: offer.image_url ?? null,
    scenes: [
      {
        number: 1,
        durationSeconds: 10,
        purpose: "Hook + desejo/problema",
        prompt: buildPrompt({
          sceneNumber: 1,
          setting: profile.setting,
          productName: offer.product_name,
          speech: scene1Speech,
          overlayText: scene1Overlay,
          action: "O avatar entra em quadro com energia natural, apresenta o produto como um achado útil para a rotina e aproxima o produto da câmera. Mostrar uma situação de uso somente quando ela for coerente com o produto. Encerrar com enquadramento estável que permita continuidade visual na Cena 2.",
        }),
        avatarSpeech: scene1Speech,
        overlayText: scene1Overlay,
      },
      {
        number: 2,
        durationSeconds: 10,
        purpose: "Oferta + preço + CTA",
        prompt: buildPrompt({
          sceneNumber: 2,
          setting: profile.setting,
          productName: offer.product_name,
          speech: scene2Speech,
          overlayText: scene2Overlay,
          action: "Começar visualmente compatível com o último quadro da Cena 1. O avatar mantém o produto em destaque, aponta naturalmente para a informação de preço e encerra olhando para a câmera com CTA simples. Não criar urgência falsa; apenas orientar a conferir preço e disponibilidade.",
        }),
        avatarSpeech: scene2Speech,
        overlayText: scene2Overlay,
      },
    ],
  };
}
