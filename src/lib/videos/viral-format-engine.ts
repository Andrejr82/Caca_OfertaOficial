/**
 * MOTOR DE FORMATOS VIRAIS
 *
 * Metodologia extraída da análise do Reel Midea Lava e Seca e do Reel Dyson WashG1.
 *
 * A premissa central:
 * Não copiamos vídeos virais. Extraímos o DNA estrutural deles e adaptamos para qualquer produto.
 *
 * DNA real: PROBLEMA RECONHECÍVEL → ESFORÇO → CONSEQUÊNCIA DRAMÁTICA → PRODUTO SILENCIOSO → RESULTADO PERFEITO.
 *
 * Regras absolutas:
 * - Nunca inventar funções ou características do produto
 * - Nunca citar marcas concorrentes
 * - Nunca usar narração (funciona sem áudio)
 * - Nunca mostrar preço ou desconto
 * - Nunca usar personagem "apresentando" o produto para a câmera
 * - A imagem do produto é a referência absoluta
 */

export type ViralFormat =
  | "problema_solucao"
  | "antes_depois"
  | "desafio_vs"
  | "curiosidade"
  | "demonstracao"
  | "situacao_cotidiana";

export type ViralScene = {
  index: number;
  name: string;
  timing: string;
  instruction: string;
};

export type ViralFormatConfig = {
  id: ViralFormat;
  label: string;
  tagline: string;
  bestFor: string[];
  structure: ViralScene[];
  splitScreen: boolean;
  dramaticConsequence: boolean;
  heroShotAtEnd: boolean;
};

export const VIRAL_FORMATS: Record<ViralFormat, ViralFormatConfig> = {

  problema_solucao: {
    id: "problema_solucao",
    label: "Problema → Solução",
    tagline: "O método antigo falha. O produto vence silenciosamente.",
    bestFor: ["lava e seca", "aspirador", "ferro", "organização", "limpeza", "eletrodoméstico"],
    splitScreen: true,
    dramaticConsequence: true,
    heroShotAtEnd: true,
    structure: [
      {
        index: 1,
        name: "GANCHO — Split Screen",
        timing: "0s–2s",
        instruction:
          "Split screen vertical dividido ao meio por linha fina branca. " +
          "Lado esquerdo: pessoa realizando a {{problem}} do jeito tradicional com expressão de esforço e frustração visíveis. Céu nublado ou ambiente caótico. Texto canto inferior esquerdo: 'MÉTODO COMUM'. " +
          "Lado direito: ambiente limpo, mão posicionando item no {{product}}. Produto elegante e detalhado. Texto canto inferior direito: '{{productLabel}} ✦'.",
      },
      {
        index: 2,
        name: "ESFORÇO",
        timing: "2s–4s",
        instruction:
          "Tela inteira. Ângulo baixo. Pessoa esforçando-se fisicamente: força, braços tensos, expressão de cansaço. " +
          "A tarefa é claramente ineficiente. Fundo dramático e escuro.",
      },
      {
        index: 3,
        name: "CONSEQUÊNCIA DRAMÁTICA",
        timing: "4s–6s",
        instruction:
          "Câmera lenta. O método tradicional falha de forma plausível: {{dramaticConsequence}}. " +
          "A cena transmite derrota. Deve parecer uma situação real que qualquer pessoa já viveu.",
      },
      {
        index: 4,
        name: "PRODUTO EM AÇÃO",
        timing: "6s–8s",
        instruction:
          "Corte limpo. Close no {{product}} funcionando silenciosamente. " +
          "Sem caos. Sem esforço. Iluminação quente. Logo e painel do produto visíveis.",
      },
      {
        index: 5,
        name: "PAYOFF — Hero Shot",
        timing: "8s–10s",
        instruction:
          "Resultado perfeito sobre o {{product}}. Câmera recua revelando o produto inteiro. " +
          "Iluminação calorosa. Sem texto. Silêncio visual satisfatório.",
      },
    ],
  },

  antes_depois: {
    id: "antes_depois",
    label: "Antes → Depois",
    tagline: "Transformação visual imediata. O produto é a virada.",
    bestFor: ["beleza", "skincare", "organização", "tinta", "limpeza", "reforma"],
    splitScreen: false,
    dramaticConsequence: false,
    heroShotAtEnd: true,
    structure: [
      {
        index: 1, name: "ESTADO ANTES", timing: "0s–2s",
        instruction: "Close-up no problema no estado ruim/sujo/desorganizado. Iluminação fria. O espectador reconhece imediatamente o problema.",
      },
      {
        index: 2, name: "AÇÃO DO PRODUTO", timing: "2s–5s",
        instruction: "O {{product}} entra em cena e age sobre o problema. Câmera dinâmica acompanhando o movimento. Transformação começa.",
      },
      {
        index: 3, name: "REVELAÇÃO", timing: "5s–7s",
        instruction: "Slow-motion ou transição limpa. Resultado parcial aparece, criando expectativa para o payoff final.",
      },
      {
        index: 4, name: "ESTADO DEPOIS — PAYOFF", timing: "7s–10s",
        instruction: "Resultado final perfeito. Iluminação quente. {{product}} no enquadramento. A diferença com o 'antes' é impactante.",
      },
    ],
  },

  desafio_vs: {
    id: "desafio_vs",
    label: "Desafio / Versus",
    tagline: "O produto enfrenta o impossível — e vence.",
    bestFor: ["aspirador robô", "liquidificador potente", "ferramenta elétrica", "impermeabilizante"],
    splitScreen: false,
    dramaticConsequence: false,
    heroShotAtEnd: true,
    structure: [
      {
        index: 1, name: "DESAFIO", timing: "0s–2s",
        instruction: "Câmera revela o obstáculo: bagunça enorme, superfície difícil, material resistente. Produto ainda não aparece. Expectativa criada.",
      },
      {
        index: 2, name: "PRODUTO ENTRA", timing: "2s–4s",
        instruction: "O {{product}} posicionado para enfrentar o desafio. Ângulo baixo dramático. Produto parece imponente e capaz.",
      },
      {
        index: 3, name: "AÇÃO", timing: "4s–7s",
        instruction: "{{product}} age com velocidade e eficiência. Câmera dinâmica: tracking, close-ups, slow motion. Progresso visível.",
      },
      {
        index: 4, name: "VITÓRIA", timing: "7s–10s",
        instruction: "Desafio superado. Close no resultado. Hero shot do {{product}}. A imagem fala sozinha.",
      },
    ],
  },

  curiosidade: {
    id: "curiosidade",
    label: "Curiosidade → Revelação",
    tagline: "Algo inesperado acontece. O produto é a resposta.",
    bestFor: ["gadget", "eletrônico", "multifunção", "smart", "acessório incomum"],
    splitScreen: false,
    dramaticConsequence: false,
    heroShotAtEnd: true,
    structure: [
      {
        index: 1, name: "DETALHE MISTERIOSO", timing: "0s–2s",
        instruction: "Close extremo em detalhe do {{product}} sem deixar claro o que é. Câmera lenta. O espectador fica curioso.",
      },
      {
        index: 2, name: "CONTEXTO", timing: "2s–5s",
        instruction: "Câmera abre lentamente. Produto e contexto de uso se revelam. Ação surpreendente começa.",
      },
      {
        index: 3, name: "REVELAÇÃO TOTAL", timing: "5s–8s",
        instruction: "{{product}} completo em ação. Resultado inesperadamente bom é mostrado.",
      },
      {
        index: 4, name: "PAYOFF", timing: "8s–10s",
        instruction: "Resultado satisfatório. Hero shot clean do {{product}}. Câmera estática. Iluminação perfeita.",
      },
    ],
  },

  demonstracao: {
    id: "demonstracao",
    label: "Demonstração Satisfatória",
    tagline: "A ação é tão satisfatória que dispensa explicação.",
    bestFor: ["cortador", "fatiador", "liquidificador", "ferramenta de corte", "brinquedo", "textura"],
    splitScreen: false,
    dramaticConsequence: false,
    heroShotAtEnd: false,
    structure: [
      {
        index: 1, name: "AÇÃO IMEDIATA", timing: "0s–3s",
        instruction: "{{product}} em ação desde o primeiro frame. Close extremo na ação mais satisfatória visualmente. Sem introdução.",
      },
      {
        index: 2, name: "SEGUNDO ÂNGULO", timing: "3s–6s",
        instruction: "Segundo ângulo da mesma ação. Detalhe diferente. A satisfação visual continua ou aumenta.",
      },
      {
        index: 3, name: "RESULTADO IMEDIATO", timing: "6s–8s",
        instruction: "Resultado da ação mostrado imediatamente. Close no efeito. Câmera lenta se o movimento for rápido.",
      },
      {
        index: 4, name: "LOOP IMPLÍCITO", timing: "8s–10s",
        instruction: "Ação recomeça ou repete, criando vontade de continuar assistindo. Câmera abre para mostrar {{product}} completo.",
      },
    ],
  },

  situacao_cotidiana: {
    id: "situacao_cotidiana",
    label: "Situação Cotidiana → Solução Natural",
    tagline: "O produto aparece como parte natural do dia a dia.",
    bestFor: ["cozinha", "café", "chaleira", "pote", "bolsa", "presente", "rotina"],
    splitScreen: false,
    dramaticConsequence: false,
    heroShotAtEnd: true,
    structure: [
      {
        index: 1, name: "MOMENTO COTIDIANO", timing: "0s–3s",
        instruction: "Cena de rotina reconhecível. {{product}} integrado ao ambiente, sem destaque excessivo.",
      },
      {
        index: 2, name: "USO NATURAL", timing: "3s–6s",
        instruction: "{{product}} usado de forma natural. Sem drama, sem surpresa — só eficiência discreta.",
      },
      {
        index: 3, name: "RESULTADO INTEGRADO", timing: "6s–8s",
        instruction: "Resultado satisfatório e natural. A cena parece autêntica, não fabricada.",
      },
      {
        index: 4, name: "HERO SHOT CONTEXTUAL", timing: "8s–10s",
        instruction: "{{product}} em seu ambiente natural após o uso. Câmera fecha suavemente. Sem fundo branco.",
      },
    ],
  },
};

// ─────────────────────────────────────────────
// SELETOR AUTOMÁTICO
// ─────────────────────────────────────────────

const FORMAT_KEYWORDS: Record<ViralFormat, string[]> = {
  problema_solucao: ["lava", "seca", "lavar", "secar", "limpar", "aspirar", "organizar", "ferro", "eletrodoméstico", "máquina de lavar", "lavadora"],
  antes_depois: ["beleza", "pele", "cabelo", "maquiagem", "skincare", "organização", "tinta", "renovar"],
  desafio_vs: ["robô", "potente", "resistente", "impermeável", "industrial", "à prova"],
  curiosidade: ["gadget", "multifunção", "smart", "inteligente", "wireless", "bluetooth", "sensor"],
  demonstracao: ["slime", "cortar", "fatiar", "liquidificar", "massagear", "textura"],
  situacao_cotidiana: ["cozinha", "café", "chaleira", "panela", "pote", "garrafa", "bolsa", "presente"],
};

export function selectViralFormat(productName: string, category?: string | null): ViralFormat {
  const text = `${productName} ${category ?? ""}`.toLowerCase();
  for (const [format, keywords] of Object.entries(FORMAT_KEYWORDS) as [ViralFormat, string[]][]) {
    if (keywords.some((kw) => text.includes(kw))) return format;
  }
  return "problema_solucao";
}

// ─────────────────────────────────────────────
// GERADOR DE PROMPT VIRAL
// ─────────────────────────────────────────────

export type ViralPromptOffer = {
  product_name: string;
  short_name?: string | null;
  category?: string | null;
  platform?: string | null;
};

const DRAMATIC_CONSEQUENCE: Record<ViralFormat, string> = {
  problema_solucao: "o resultado do método tradicional é arruinado por algo imprevisível e plausível (chuva, queda, sujeira, desgaste) que qualquer pessoa já viveu",
  antes_depois: "o estado 'antes' revela-se pior do que parecia — detalhe que o espectador não havia notado",
  desafio_vs: "o desafio parece impossível por um momento — o produto hesita, a tensão sobe — antes de vencer",
  curiosidade: "o detalhe misterioso cria uma pergunta que só é respondida no final",
  demonstracao: "a ação é tão satisfatória que parece impossível de parar — cria loop mental",
  situacao_cotidiana: "sem consequência dramática — a naturalidade é a atração",
};

export function buildViralVideoPrompt(offer: ViralPromptOffer, formatOverride?: ViralFormat): string {
  const format = formatOverride ?? selectViralFormat(offer.product_name, offer.category);
  const config = VIRAL_FORMATS[format];
  const product = offer.short_name?.trim() || offer.product_name.trim();
  const dramaticNote = DRAMATIC_CONSEQUENCE[format];

  const scenesText = config.structure
    .map(
      (scene) =>
        `CENA ${scene.index} — ${scene.timing} — ${scene.name}\n` +
        scene.instruction
          .replace(/{{product}}/g, product)
          .replace(/{{productLabel}}/g, product.toUpperCase())
          .replace(/{{problem}}/g, `tarefa que o ${product} resolve`)
          .replace(/{{dramaticConsequence}}/g, dramaticNote),
    )
    .join("\n\n");

  return `PROMPT PARA GEMINI / GOOGLE FLOW — VÍDEO VIRAL PARA REELS

PRODUTO: ${product}
MARKETPLACE: ${offer.platform ?? "não informado"}
FORMATO VIRAL: ${config.label}
ESTRATÉGIA: ${config.tagline}

━━━━━━━━━━━━━━━━━━━━━━━━━
OBJETIVO
━━━━━━━━━━━━━━━━━━━━━━━━━
Criar um Reel de 9–10 segundos com estrutura de retenção real.
NÃO é catálogo. NÃO é demonstração institucional.
É uma mini-história com gancho, conflito e payoff visual.
Deve funcionar 100% sem áudio — só imagem e emoção.

━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIGURAÇÃO TÉCNICA
━━━━━━━━━━━━━━━━━━━━━━━━━
- Formato: 9:16 vertical
- Duração: 10 segundos
- Sem narração, diálogo ou voz humana
- Sem preço, desconto ou texto promocional
- Música ambiente discreta (opcional)
- Alta resolução, cinematográfico
- Aparência de conteúdo nativo de Reel

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA CRÍTICA — PRODUTO
━━━━━━━━━━━━━━━━━━━━━━━━━
Use a imagem anexada como referência visual absoluta.
Produto idêntico em todos os frames — cor, formato, proporções, logo.
NÃO inventar características, acessórios ou funções.
NÃO citar concorrentes. NÃO mostrar pessoa "apresentando" o produto.

━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA DE CENAS
━━━━━━━━━━━━━━━━━━━━━━━━━
${scenesText}

━━━━━━━━━━━━━━━━━━━━━━━━━
CÂMERA E ESTILO
━━━━━━━━━━━━━━━━━━━━━━━━━
- Cenas do problema: iluminação fria, tons dessaturados
- Cenas do produto/resultado: iluminação quente, ambiente limpo
- Movimentos suaves e cinematográficos
- Close-ups em expressões e detalhes do produto
- Sem câmera decorativa ou giro 360°

━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORIDADE DA GERAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━
1. Emoção reconhecível
2. Fidelidade absoluta ao produto
3. Conflito visual plausível
4. Payoff satisfatório e silencioso
5. Qualidade cinematográfica`;
}
