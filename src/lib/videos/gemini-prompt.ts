export type GeminiPromptOffer = {
  product_name: string;
  current_price: number | string;
  old_price?: number | string | null;
  platform?: string | null;
  category?: string | null;
  shipping_free?: boolean | null;
  coupon?: string | null;
  original_url?: string | null;
  short_name?: string | null;
};

import { classifyGeminiUsabilityCategory } from "@/lib/videos/gemini-usability-prompt";
import { getSalesVideoDirection } from "@/lib/videos/sales-video-creative-director";
export { classifyGeminiUsabilityCategory } from "@/lib/videos/gemini-usability-prompt";

const CATEGORY_LABELS = {
  moda: "Moda e vestuário",
  beleza: "Beleza e autocuidado",
  casa_cozinha: "Casa e cozinha",
  utilidades: "Utilidades domésticas",
  eletronicos: "Eletrônicos e games",
  pet: "Pet",
  fitness: "Fitness e esporte",
  bebe_crianca: "Bebê e criança",
  acessorios: "Acessórios",
  organizacao_limpeza: "Organização e limpeza",
  geral: "Produto físico",
} as const;

export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  const category = classifyGeminiUsabilityCategory(offer);
  const direction = getSalesVideoDirection(offer);
  const product = offer.short_name?.trim() || offer.product_name.trim();

  return `PROMPT PARA GEMINI — VÍDEO DE USABILIDADE DO PRODUTO

PRODUTO: ${product}
CATEGORIA DE ROTEIRO: ${CATEGORY_LABELS[category]}
ARQUÉTIPO CRIATIVO: ${direction.label}
MARKETPLACE: ${offer.platform ?? "não informado"}

OBJETIVO COMERCIAL
Crie um vídeo publicitário hiper-realista de aproximadamente 15 segundos que faça a pessoa desejar o produto pela SITUAÇÃO DE USO.
Ao assistir sem áudio, deve ficar claro como o produto entra na rotina, como é usado e qual benefício visual/prático merece ser avaliado.
NÃO criar vídeo de catálogo. NÃO usar pessoa apresentando o produto. NÃO começar com packshot ou hero shot estático.

REGRA CRÍTICA — IDENTIDADE E FIDELIDADE DO PRODUTO
Use a imagem anexada como REFERÊNCIA VISUAL PRINCIPAL, ABSOLUTA E OBRIGATÓRIA.
O produto do primeiro ao último frame deve parecer o MESMO OBJETO FÍSICO da imagem original.
Preserve formato, proporções, cor, acabamento, peças, componentes, textos, logotipos, quantidade e detalhes visíveis.
NÃO redesenhar, estilizar, substituir ou "melhorar" o produto.
NÃO inventar acessórios, peças, marcas, textos, recursos ou componentes ausentes.
Evitar ângulos que obriguem a IA a inventar lados não mostrados.

CONFIGURAÇÃO
- duração aproximada: 15 segundos;
- vertical 9:16;
- alta resolução;
- aparência de publicidade lifestyle premium e natural;
- ação começa no primeiro segundo;
- somente música instrumental discreta;
- SEM AVATAR OFERTANDO;
- SEM NARRAÇÃO;
- SEM DIÁLOGOS;
- SEM VOZ HUMANA;
- SEM TEXTOS PROMOCIONAIS;
- SEM PREÇO NA TELA.

DIREÇÃO CRIATIVA
DESEJO A EXPLORAR: ${direction.desire}.
AMBIENTE: ${direction.environment}.
ILUMINAÇÃO: ${direction.lighting}.
REGRA ANTI-APRESENTAÇÃO: ${direction.antiPresentation}.

SEQUÊNCIA OBRIGATÓRIA — AÇÃO, NÃO APRESENTAÇÃO

CENA 1 — 0–3s — USO JÁ COMEÇOU
${direction.openingAction}. A ação precisa estar acontecendo desde o primeiro frame; não gastar tempo mostrando o produto parado.

CENA 2 — 3–6s — GESTO PRINCIPAL
${direction.mainAction}. O produto permanece claramente reconhecível e integrado ao contexto real.

CENA 3 — 6–9s — PROVA VISUAL
${direction.proofAction}. Mostrar algo que ajude a pessoa a entender uso, escala, ergonomia ou resultado observável sem criar promessa.

CENA 4 — 9–12s — CONTINUIDADE DA EXPERIÊNCIA
Continuar a mesma situação de uso com um segundo ângulo funcional. Não interromper a narrativa para exibir o produto como catálogo.

CENA 5 — 12–15s — FECHAMENTO EM CONTEXTO
Encerrar ainda com o produto em uso ou imediatamente após a ação, em composição natural. Não usar pessoa segurando o produto para câmera. Não usar hero shot isolado em fundo vazio.

CÂMERA
${direction.camera}.
Cada movimento deve revelar uso, escala, gesto ou resultado. Evitar câmera decorativa, giro 360 graus, zoom agressivo ou ângulo que force invenção visual.

CONSISTÊNCIA
- mesmo produto em todos os frames;
- mesma variante, cor, forma, proporção e quantidade;
- nada aparece ou desaparece sem base na referência;
- mãos e corpos anatomicamente naturais;
- cenário coerente entre cortes;
- movimento físico plausível.

NÃO INVENTAR CARACTERÍSTICAS
${direction.restrictions}.
Não inventar potência, material, tecnologia, resultado, eficácia, durabilidade, conforto, segurança ou desempenho além do que o produto e a referência sustentam.

PRIORIDADE DA GERAÇÃO
1. uso real compreensível;
2. fidelidade absoluta ao produto;
3. movimento natural;
4. prova visual plausível;
5. desejo pela situação de uso;
6. qualidade cinematográfica.

RESULTADO ESPERADO
Um vídeo que pareça uma pequena cena real de alguém usando o produto — não uma demonstração de vendedor, não um catálogo animado e não uma sequência de produto parado.`;
}

function numeroPorExtenso(num: number): string {
  if (num === 0) return "zero";
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  if (num < 20) return unidades[num];
  if (num < 100) return dezenas[Math.floor(num / 10)] + (num % 10 ? ` e ${unidades[num % 10]}` : "");
  if (num === 100) return "cem";
  if (num < 1000) return centenas[Math.floor(num / 100)] + (num % 100 ? ` e ${numeroPorExtenso(num % 100)}` : "");
  if (num < 1000000) {
    const mil = Math.floor(num / 1000);
    const resto = num % 1000;
    return `${mil === 1 ? "mil" : `${numeroPorExtenso(mil)} mil`}${resto ? ` ${resto < 100 ? "e " : ""}${numeroPorExtenso(resto)}` : ""}`;
  }
  return String(num);
}

export function formatLongPriceForSpeech(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "preço não informado";
  const num = Number(valor);
  if (!Number.isFinite(num)) return String(valor);
  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);
  const r = reais > 0 ? `${numeroPorExtenso(reais)} ${reais === 1 ? "real" : "reais"}` : "";
  const c = centavos > 0 ? `${numeroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}` : "";
  return [r, c].filter(Boolean).join(" e ") || "zero reais";
}
