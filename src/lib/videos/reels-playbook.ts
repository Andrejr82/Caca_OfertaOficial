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
    return {
      niche: "Casa/Cozinha/Organização",
      setting: "cozinha residencial contemporânea, acolhedora e realista",
      angle: "praticidade + desejo de uso no dia a dia",
    };
  }
  if (/(beleza|secador|chapinha|escova|maquiagem|cabelo)/.test(text)) {
    return {
      niche: "Beleza",
      setting: "penteadeira ou banheiro elegante, iluminado e realista",
      angle: "resultado visual + praticidade",
    };
  }
  if (/(pet|gato|cachorro|cao|areia|tapete higienico|racao)/.test(text)) {
    return {
      niche: "Pet",
      setting: "sala de casa organizada e acolhedora com contexto pet",
      angle: "cuidado + praticidade + economia",
    };
  }
  if (/(tenis|roupa|moda|bolsa|camisa|vestido)/.test(text)) {
    return {
      niche: "Moda",
      setting: "ambiente lifestyle clean, elegante e cotidiano",
      angle: "estilo + custo-benefício",
    };
  }
  if (/(furadeira|parafusadeira|serra|ferramenta)/.test(text)) {
    return {
      niche: "Ferramentas",
      setting: "oficina ou garagem organizada e realista",
      angle: "problema resolvido + eficiência",
    };
  }
  return {
    niche: "Geral",
    setting: "ambiente doméstico realista e coerente com o produto",
    angle: "benefício principal + oportunidade",
  };
}

export function buildTwoSceneReelsPlan(offer: ReelsPromptOffer): ReelsPromptPlan {
  const profile = classifyNiche(offer);
  const price = brl(offer.current_price);
  const discount = discountPercent(offer.current_price, offer.old_price);
  const offerSignal = discount
    ? `${discount}% OFF, de ${brl(offer.old_price!)} por ${price}`
    : `por ${price}`;
  const cta = "Confira o preço e a disponibilidade antes que a oferta mude.";
  const continuity = [
    "Mesmo avatar hiper-realista, mesma roupa, mesmo cabelo, mesma iluminação, mesmo cenário e o mesmo produto da imagem de referência.",
    "Formato vertical 9:16, aparência cinematográfica natural.",
    "Não alterar marca, formato, cor ou detalhes do produto.",
    "Não inventar funções que não estejam visíveis ou descritas no nome do produto.",
  ].join(" ");

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
        prompt: `${continuity} Cena de abertura em ${profile.setting}. O avatar entra em quadro com energia natural e apresenta o produto como um achado útil para a rotina. Mostrar o produto em destaque e, quando fizer sentido, uma situação de uso coerente sem afirmar desempenho não comprovado. Priorizar mãos, expressão facial e close do produto. Finalizar a cena deixando espaço visual para continuidade na Cena 2. Produto: ${offer.product_name}.`,
        avatarSpeech: `Se você gosta de deixar a rotina mais prática, olha esse achado: ${offer.product_name}.`,
        overlayText: "Achado que faz sentido no dia a dia",
      },
      {
        number: 2,
        durationSeconds: 10,
        purpose: "Oferta + preço + CTA",
        prompt: `${continuity} Continuação direta da Cena 1 em ${profile.setting}. Começar com composição compatível com o quadro final anterior. Mostrar novamente o produto e destacar visualmente a oferta, sem criar selos falsos. O avatar aponta para o produto e encerra com CTA simples. Inserir espaço limpo para texto de preço na tela. Produto: ${offer.product_name}. Oferta informada: ${offerSignal}.`,
        avatarSpeech: discount
          ? `E o que chamou atenção foi o preço: caiu de ${brl(offer.old_price!)} para ${price}. Confira enquanto estiver assim.`
          : `Hoje ele aparece por ${price}. Confira o preço e a disponibilidade antes que mude.`,
        overlayText: discount ? `${discount}% OFF • ${price}` : price,
      },
    ],
  };
}
