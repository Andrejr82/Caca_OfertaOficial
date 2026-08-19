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

export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  return buildGeminiUsabilityPrompt(offer);
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
