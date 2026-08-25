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

export { classifyGeminiUsabilityCategory } from "@/lib/videos/gemini-usability-prompt";
import { buildGeminiUsabilityPrompt } from "@/lib/videos/gemini-usability-prompt";
import { getSalesVideoDirection } from "@/lib/videos/sales-video-creative-director";

export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  const base = buildGeminiUsabilityPrompt(offer);
  const direction = getSalesVideoDirection(offer);

  const creativeDirection = `\n\nDIREÇÃO CRIATIVA DE CONVERSÃO — PRIORIDADE ALTA\nARQUÉTIPO: ${direction.label}\nDESEJO A EXPLORAR: ${direction.desire}\n\nABERTURA\n${direction.openingAction}. A ação deve começar no primeiro segundo. Não usar abertura de catálogo, packshot estático ou pessoa apresentando o produto.\n\nUSO PRINCIPAL\n${direction.mainAction}.\n\nPROVA VISUAL\n${direction.proofAction}.\n\nCÂMERA\n${direction.camera}. Cada movimento de câmera deve revelar uso, escala, gesto ou resultado; evitar movimento decorativo sem função comercial.\n\nILUMINAÇÃO\n${direction.lighting}.\n\nREGRA ANTI-APRESENTAÇÃO\n${direction.antiPresentation}.\n\nRESTRIÇÕES ESPECÍFICAS\n${direction.restrictions}.\n\nCRITÉRIO DE SUCESSO\nAo assistir sem áudio, a pessoa deve entender em poucos segundos: como o produto entra na rotina, como ele é usado e por que vale abrir a oferta para avaliar a compra. O vídeo deve despertar desejo pela situação de uso, não apenas mostrar o objeto.`;

  return `${base}${creativeDirection}`;
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
