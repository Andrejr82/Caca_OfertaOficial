/**
 * MOTOR DE LOCUÇÃO VIRAL (VOICEOVER ENGINE)
 *
 * Gera roteiros de locução sincronizados de 9–10 segundos para qualquer produto do sistema.
 * Segue a estrutura comprovada de retenção do Instagram Reels:
 * 1. Gancho de Dor Emocional (0s–3s) — ativa identificação imediata
 * 2. Demonstração de Alívio / Benefício (3s–7s) — apresenta o produto resolvendo
 * 3. Chamada para Ação Rápida (8s–10s) — "Acesse o link na bio!"
 */

import type { ViralFormat } from "@/lib/videos/viral-format-engine";

export type VoiceoverOffer = {
  product_name: string;
  category?: string | null;
  short_name?: string | null;
};

export type VoiceoverScriptResult = {
  script: string;
  text: string;
  speechText: string;
  wordCount: number;
  estimatedDurationSeconds: number;
  estimatedDurationSec: number;
  cta: string;
  niche?: string;
  painHook?: string;
  reliefBridge?: string;
};

const DEFAULT_CTA = "Acesse o link na bio!";

type NicheVoiceoverPattern = {
  name: string;
  keywords: string[];
  painHook: (product: string) => string;
  solutionRelief: (product: string) => string;
};

const NICHE_PATTERNS: NicheVoiceoverPattern[] = [
  {
    name: "Lava e Seca",
    keywords: ["lava e seca", "lavadora e secadora", "lava & seca", "secadora"],
    painHook: () => "Se você ainda sofre com roupa que não seca na chuva e fica com cheiro ruim...",
    solutionRelief: (product) => `...essa ${product} resolveu tudo! Sai quentinha e pronta pra guardar.`,
  },
  {
    name: "Air Fryer",
    keywords: ["air fryer", "fritadeira", "airfryer"],
    painHook: () => "Chega de fumaça e sujeira de óleo espirrando no fogão...",
    solutionRelief: (product) => `...essa ${product} deixa tudo crocante e sequinho sem usar uma gota de gordura.`,
  },
  {
    name: "Robô Aspirador",
    keywords: ["aspirador", "robo aspirador", "robô aspirador", "aspirador portátil", "aspirador sem fio"],
    painHook: () => "Se você perde tempo varrendo poeira e pelo de pet todo santo dia...",
    solutionRelief: (product) => `...esse ${product} limpa os cantinhos sozinho enquanto você descansa.`,
  },
  {
    name: "Ferramentas",
    keywords: ["furadeira", "parafusadeira", "ferramenta", "maleta de ferramentas"],
    painHook: () => "Apertar parafuso na chave de mão e cansar o braço é teste de paciência...",
    solutionRelief: (product) => `...essa ${product} fura e monta qualquer móvel em segundos sem esforço.`,
  },
  {
    name: "Limpeza / Mop",
    keywords: ["mop", "esfregão", "rodo mágico", "balde centrifuge"],
    painHook: () => "Chega de torcer pano no chão e sujar a mão com água suja...",
    solutionRelief: (product) => `...esse ${product} centrifuga tudo seco num instante sem você encostar na sujeira.`,
  },
  {
    name: "Térmicos",
    keywords: ["garrafa térmica", "garrafa termica", "copo térmico", "copo termico", "stanley"],
    painHook: () => "Tomar café frio no trabalho ou água quente no calor ninguém merece...",
    solutionRelief: (product) => `...esse ${product} mantém tudo trincando de gelado ou quente por horas.`,
  },
  {
    name: "Áudio / Fones",
    keywords: ["fone", "fone bluetooth", "headphone", "earbuds", "fone sem fio"],
    painHook: () => "Fio embolando e fone caindo da orelha no meio do treino irrita demais...",
    solutionRelief: (product) => `...esse ${product} tem som potente, encaixa firme e a bateria dura o dia todo.`,
  },
  {
    name: "Cozinha",
    keywords: ["panela de pressão", "panela de pressao", "panela elétrica"],
    painHook: () => "Se você tem medo de panela de pressão apitando no fogão...",
    solutionRelief: (product) => `...essa ${product} cozinha no ponto perfeito com trava de segurança total.`,
  },
  {
    name: "Calçados",
    keywords: ["tênis", "tenis", "calçado", "sapato"],
    painHook: () => "Passar o dia com calçado duro que machuca o calcanhar acaba com o dia...",
    solutionRelief: (product) => `...esse ${product} tem amortecimento tão macio que parece que você tá pisando em nuvem.`,
  },
  {
    name: "Climatização",
    keywords: ["ventilador", "ar condicionado", "ar-condicionado", "climatizador"],
    painHook: () => "Tentar dormir no calor abafado revirando na cama não dá...",
    solutionRelief: (product) => `...esse ${product} joga um vento fresco e silencioso pra você descansar em paz.`,
  },
  {
    name: "Beleza",
    keywords: ["escova secadora", "secador", "chapinha", "prancha"],
    painHook: () => "Gastar mais de meia hora cansando o braço pra secar o cabelo ninguém merece...",
    solutionRelief: (product) => `...essa ${product} seca e alisa ao mesmo tempo em menos de dez minutos.`,
  },
  {
    name: "Organização",
    keywords: ["pote", "potes herméticos", "organizador", "cabide"],
    painHook: () => "Armário bagunçado onde você nunca acha nada só dá dor de cabeça...",
    solutionRelief: (product) => `...esses ${product} protegem o alimento e dobram o espaço da sua cozinha.`,
  },
];

/**
 * Normaliza pronúncia de termos estrangeiros e marcas para TTS brasileiro natural
 */
const TTS_PRONUNCIATION_MAP: [RegExp, string][] = [
  [/\bShopee\b/gi, "Chopí"],
  [/\bAir Fryer\b/gi, "ér fráier"],
  [/\bAirfryer\b/gi, "ér fráier"],
  [/\bBluetooth\b/gi, "blutúfe"],
  [/\bStanley\b/gi, "stênlei"],
  [/\bMidea\b/gi, "Midêa"],
  [/\bInverter\b/gi, "Invérter"],
  [/\bUSB\b/gi, "u ésse bê"],
  [/\bSSD\b/gi, "ésse ésse dê"],
  [/\bHDMI\b/gi, "agá dê éme í"],
  [/\bLED\b/gi, "léd"],
  [/\bWi-Fi\b/gi, "uai fai"],
  [/\bWifi\b/gi, "uai fai"],
];

export function cleanProductNameForVoiceover(name: string): string {
  return name
    .replace(/\s*[-–—]\s*(?:Shopee|Mercado Livre|Amazon|Magalu).*$/iu, "")
    .replace(/\b(?:110v|220v|bivolt|original|promoção|frete grátis|pronta entrega|envio rápido)\b/giu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function shortenProductTitleForSpeech(name: string): string {
  const clean = cleanProductNameForVoiceover(name);
  const words = clean.split(/\s+/);
  if (words.length <= 4) return clean;
  return words.slice(0, 4).join(" ");
}

export function normalizeTextForTTS(text: string): string {
  let output = text;
  for (const [pattern, pronunciation] of TTS_PRONUNCIATION_MAP) {
    output = output.replace(pattern, pronunciation);
  }
  return output;
}

export function estimateVoiceoverDurationSeconds(script: string): number {
  const words = script.trim().split(/\s+/).length;
  // A uma taxa de +25% de fala acelerada para Reels, média de 3.4 palavras por segundo
  const seconds = Number((words / 3.4).toFixed(1));
  return Math.max(7.0, Math.min(10.5, seconds));
}

/**
 * Gera o roteiro de locução viral sob medida para a oferta.
 * Sempre finaliza com "Acesse o link na bio!" garantindo conversão.
 */
export function buildViralVoiceoverScript(
  offer: VoiceoverOffer,
  format?: ViralFormat,
  customCta?: string,
): VoiceoverScriptResult {
  const cta = customCta?.trim() || DEFAULT_CTA;
  const rawTitle = offer.short_name?.trim() || offer.product_name.trim();
  const cleanTitle = shortenProductTitleForSpeech(rawTitle);
  const normalizedTitle = cleanTitle.toLowerCase();

  // 1. Tenta identificar um padrão de nicho pré-configurado
  const matchedPattern = NICHE_PATTERNS.find((pattern) =>
    pattern.keywords.some((kw) => normalizedTitle.includes(kw.toLowerCase())),
  );

  let script: string;

  if (matchedPattern) {
    const pain = matchedPattern.painHook(cleanTitle);
    const relief = matchedPattern.solutionRelief(cleanTitle);
    script = `${pain} ${relief} ${cta}`;
  } else {
    // 2. Fallback inteligente baseado no formato viral
    const shortProduct = cleanTitle.split(" ").slice(0, 4).join(" ");
    
    switch (format) {
      case "antes_depois":
        script = `Olha o estado disso antes e depois de usar esse ${shortProduct}! A diferença na prática é impressionante. ${cta}`;
        break;
      case "desafio_vs":
        script = `O método tradicional versus esse ${shortProduct}. Quem ganha? A praticidade desse produto vence disparado! ${cta}`;
        break;
      case "demonstracao":
        script = `Você sabia que dava pra resolver isso tão fácil com esse ${shortProduct}? Olha como é simples no dia a dia. ${cta}`;
        break;
      case "curiosidade":
        script = `O maior erro de quem tenta resolver isso do jeito antigo... Esse ${shortProduct} resolve em minutos sem estresse. ${cta}`;
        break;
      case "situacao_cotidiana":
      case "problema_solucao":
      default:
        script = `Se você ainda se estressa com isso no dia a dia... Esse ${shortProduct} resolveu tudo de um jeito super prático! ${cta}`;
        break;
    }
  }

  const speechText = normalizeTextForTTS(script);
  const words = script.split(/\s+/).length;
  const estimatedDuration = estimateVoiceoverDurationSeconds(script);

  return {
    script,
    text: script,
    speechText,
    wordCount: words,
    estimatedDurationSeconds: estimatedDuration,
    estimatedDurationSec: estimatedDuration,
    cta,
    niche: matchedPattern?.name,
    painHook: matchedPattern ? matchedPattern.painHook(cleanTitle) : undefined,
    reliefBridge: matchedPattern ? matchedPattern.solutionRelief(cleanTitle) : undefined,
  };
}
