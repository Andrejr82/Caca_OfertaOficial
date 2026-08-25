import { getSalesVideoDirection } from "@/lib/videos/sales-video-creative-director";

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
  if (/(cozinha|casa|panela|sanduicheira|cafeteira|chaleira|mixer|organizador|gaveta|armario)/.test(text)) return "Casa/Cozinha/Organização";
  if (/(beleza|secador|chapinha|escova|maquiagem|cabelo)/.test(text)) return "Beleza";
  if (/(pet|gato|cachorro|cao|areia|tapete higienico|racao)/.test(text)) return "Pet";
  if (/(tenis|roupa|moda|bolsa|camisa|vestido|sapato|sandalia|bota)/.test(text)) return "Moda";
  if (/(furadeira|parafusadeira|serra|ferramenta)/.test(text)) return "Ferramentas";
  if (/(notebook|computador|monitor|teclado|mouse|smartphone|celular|fone|headset)/.test(text)) return "Informática";
  return "Geral";
}

function buildPrompt(args: {
  sceneNumber: 1 | 2;
  productName: string;
  speech: string;
  overlayText: string;
  action: string;
  environment: string;
  camera: string;
  lighting: string;
  antiPresentation: string;
  restrictions: string;
}) {
  const continuation = args.sceneNumber === 1
    ? "Construa o quadro final para permitir continuação natural no segundo clipe: mesma posição corporal, mesma direção de movimento, mesmo cenário e mesma luz."
    : "CONTINUIDADE OBRIGATÓRIA: comece como continuação do último quadro da Cena 1. Preserve exatamente avatar, rosto, idade aparente, cabelo, roupa, acessórios, cenário, iluminação, produto e direção do movimento.";

  return [
    `CENA ${args.sceneNumber} — 10 segundos — vertical 9:16 — hiper-realista — publicidade lifestyle natural.`,
    `PRODUTO DE REFERÊNCIA: ${args.productName}. A imagem anexada é a autoridade visual. Preserve marca, formato, cor, proporções e detalhes reconhecíveis. Não redesenhe nem embeleze o produto.`,
    `AMBIENTE: ${args.environment}.`,
    `AÇÃO PRINCIPAL: ${args.action}.`,
    `CÂMERA: ${args.camera}. O movimento de câmera deve acompanhar a ação; não usar câmera como simples vitrine do produto.`,
    `ILUMINAÇÃO: ${args.lighting}.`,
    `REGRA ANTI-APRESENTAÇÃO: ${args.antiPresentation}. O avatar hiper-realista deve estar integrado à situação real de uso, nunca no papel de apresentador de oferta.`,
    continuation,
    `FALA EXATA DO AVATAR, em português do Brasil, natural, curta e sincronizada com a ação: “${args.speech}”`,
    `TEXTO NA TELA: “${args.overlayText}”. Use tipografia proporcional, legível e discreta na área segura. O CTA deve induzir clique sem ocupar a tela inteira.`,
    `RESTRIÇÕES: ${args.restrictions}. Não inventar cupons, urgência, avaliações, selos, funções, materiais ou benefícios não confirmados.`,
    "ÁUDIO: voz clara e natural, ambiente discreto, sem trilha dominando a fala.",
    "QUALIDADE: movimentos humanos realistas, mãos corretas, produto único e consistente, sem deformações, sem duplicações e sem texto ilegível.",
  ].join("\n");
}

export function buildTwoSceneReelsPlan(offer: ReelsPromptOffer): ReelsPromptPlan {
  const niche = classifyNiche(offer);
  const direction = getSalesVideoDirection(offer);
  const price = brl(offer.current_price);
  const discount = discountPercent(offer.current_price, offer.old_price);
  const cta = "Toque no link e confira a oferta atual.";

  const scene1Speech = `Olha como esse ${direction.label.toLowerCase()} funciona melhor quando você vê em uso de verdade.`;
  const scene1Overlay = direction.desire;
  const scene2Speech = discount
    ? `Ele está por ${price}. Toque no link e confira a oferta antes de decidir.`
    : `Hoje ele está por ${price}. Toque no link e confira a oferta.`;
  const scene2Overlay = discount
    ? `${discount}% OFF • ${price} • Toque no link`
    : `${price} • Toque no link`;

  return {
    niche,
    angle: direction.desire,
    cta,
    referenceImageUrl: offer.image_url ?? null,
    scenes: [
      {
        number: 1,
        durationSeconds: 10,
        purpose: "Uso real + desejo",
        prompt: buildPrompt({
          sceneNumber: 1,
          productName: offer.product_name,
          speech: scene1Speech,
          overlayText: scene1Overlay,
          environment: direction.environment,
          camera: direction.camera,
          lighting: direction.lighting,
          antiPresentation: direction.antiPresentation,
          restrictions: direction.restrictions,
          action: `${direction.openingAction}. Em seguida, ${direction.mainAction}. Mostrar ação já no primeiro segundo; não gastar abertura apresentando o produto parado.`,
        }),
        avatarSpeech: scene1Speech,
        overlayText: scene1Overlay,
      },
      {
        number: 2,
        durationSeconds: 10,
        purpose: "Prova visual + oferta + clique",
        prompt: buildPrompt({
          sceneNumber: 2,
          productName: offer.product_name,
          speech: scene2Speech,
          overlayText: scene2Overlay,
          environment: direction.environment,
          camera: direction.camera,
          lighting: direction.lighting,
          antiPresentation: direction.antiPresentation,
          restrictions: direction.restrictions,
          action: `${direction.proofAction}. Manter o produto em uso enquanto a fala cita o preço. Encerrar ainda dentro da situação real, sem hero shot estático e sem avatar apontando para texto.`,
        }),
        avatarSpeech: scene2Speech,
        overlayText: scene2Overlay,
      },
    ],
  };
}
