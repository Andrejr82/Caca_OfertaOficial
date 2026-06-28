import { logScraperMetrics } from "@/core/scraper/telemetry";

const HTML_BOT_SIGNATURES = [
  "cloudflare",
  "captcha",
  "access denied",
  "forbidden",
  "robot check",
  "verify you are human",
  "security check",
  "blocked",
  "akamai",
  "request blocked",
  "are you a bot",
  "robot verification",
  "challenge",
  "checking your browser",
  "insira sua senha",
  "digite sua senha",
  "acesso negado",
  "digite os caracteres da imagem"
];

export function validateHtml(html: string | null | undefined, source: string): boolean {
  if (!html) {
    logScraperMetrics("HTML_VALIDATOR", { source, status: "REJECT", reason: "HTML VAZIO" });
    return false;
  }

  const cleanHtml = html.trim().toLowerCase();

  // DOM quase vazio (Mínimo de caracteres úteis)
  if (cleanHtml.length < 500) {
    logScraperMetrics("HTML_VALIDATOR", { source, status: "REJECT", reason: "HTML MUITO CURTO" });
    return false;
  }

  // Validação heurística de e-commerce (Presença de produtos estruturados)
  // Como agora passamos o [TEXTO], [LINK], [IMG] do adapter:
  const isExtractedData = cleanHtml.includes("[texto]") && cleanHtml.includes("[link]");
  
  const hasLinks = cleanHtml.includes("href=") || cleanHtml.includes("[link]");
  const hasImages = cleanHtml.includes("img ") || cleanHtml.includes("image") || cleanHtml.includes("[img]");
  const hasPrice = cleanHtml.includes("r$") || cleanHtml.includes("price") || cleanHtml.includes("valor");

  if (!hasLinks || !hasImages || !hasPrice) {
    logScraperMetrics("HTML_VALIDATOR", { source, status: "REJECT", reason: "HTML INCOMPLETO (Sem links, imagens ou preços detectados)" });
    return false;
  }

  // Verifica as assinaturas de bloqueio com densidade
  let botSignaturesFound = 0;
  for (const signature of HTML_BOT_SIGNATURES) {
    if (cleanHtml.includes(signature)) {
      botSignaturesFound++;
    }
  }

  // Se tiver muitas assinaturas de bot OU tiver assinaturas de bot e HTML muito curto (típico de página de erro sem produtos de verdade)
  // No caso de `isExtractedData` ser true, o tamanho já é menor pois só tem as strings filtradas, 
  // mas dificilmente terá a palavra "captcha" solta ali a menos que seja um bloqueio.
  if (botSignaturesFound > 2 || (botSignaturesFound > 0 && cleanHtml.length < 3000 && !isExtractedData)) {
    logScraperMetrics("HTML_VALIDATOR", { source, status: "REJECT", reason: `BLOQUEIO DETECTADO (Assinaturas de Bot: ${botSignaturesFound})` });
    return false;
  }
  
  // Condição especial para extracted data onde o Cloudflare vazou no texto do link/texto
  if (isExtractedData && botSignaturesFound > 0) {
     const productsCount = (cleanHtml.match(/\[texto\]/g) || []).length;
     if (productsCount === 0) {
        logScraperMetrics("HTML_VALIDATOR", { source, status: "REJECT", reason: "BLOQUEIO DETECTADO EM EXTRACTED DATA" });
        return false;
     }
  }

  return true;
}
