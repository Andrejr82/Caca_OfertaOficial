/**
 * Resolvedor central de URLs para a Publicação Expressa.
 *
 * Responsabilidades:
 * - Seguir redirects de short links (meli.la, s.shopee.com.br)
 * - Proteger contra SSRF (IPs privados, localhost, protocolos não permitidos)
 * - Validar domínio final contra allowlist de marketplaces
 * - Detectar loops e limitar número de saltos
 * - Retornar URL canônica resolvida + cadeia de redirects
 */

export interface UrlResolveOptions {
  maxRedirects?: number;
  timeoutMs?: number;
}

export interface UrlResolveResult {
  resolvedUrl: string;
  redirectChain: string[];
  marketplace?: "Shopee" | "Mercado Livre" | "Shein" | "Outro";
  htmlBody?: string;
  errorCode?:
    | "SSRF_BLOCKED"
    | "REDIRECT_LOOP"
    | "REDIRECT_LIMIT_EXCEEDED"
    | "UNEXPECTED_REDIRECT_DOMAIN"
    | "TIMEOUT_RESOLVING_URL"
    | "EMPTY_RESPONSE"
    | "INVALID_INPUT_URL";
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const MAX_REDIRECTS_DEFAULT = 10;
const TIMEOUT_MS_DEFAULT = 15_000;

/**
 * Domínios de origem permitidos (short link ou marketplace direto).
 * Apenas esses domínios são aceitos como entrada.
 */
const ALLOWED_INPUT_DOMAINS = [
  "s.shopee.com.br",
  "shopee.com.br",
  "meli.la",
  "mercadolivre.com.br",
  "www.mercadolivre.com.br",
  "produto.mercadolivre.com.br",
  "mercadolibre.com",
  "br.shein.com",
  "shein.com",
  "onelink.shein.com",
];

/**
 * Domínios de destino permitidos após resolução.
 * Inclui CDNs de imagem dos marketplaces.
 */
const ALLOWED_DESTINATION_DOMAINS = [
  "shopee.com.br",
  "s.shopee.com.br",
  "down-br.img.susercontent.com",
  "susercontent.com",
  "mercadolivre.com.br",
  "www.mercadolivre.com.br",
  "produto.mercadolivre.com.br",
  "mercadolibre.com",
  "api.mercadolibre.com",
  "mlstatic.com",
  "http2.mlstatic.com",
  "meli.la",
  "br.shein.com",
  "shein.com",
];

/**
 * Faixas de IPs privados / cloud metadata que devem ser bloqueadas (SSRF).
 */
const PRIVATE_IP_RANGES = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,   // AWS metadata
  /^100\.64\./,    // Carrier-grade NAT
  /^fc00:/i,       // IPv6 ULA
  /^fe80:/i,       // IPv6 link-local
];

// ─── Funções de Segurança ────────────────────────────────────────────────────

/**
 * Verifica se o hostname aponta para um IP privado ou localhost.
 * Usado para proteção SSRF em cada salto do redirect.
 */
export function isPrivateIp(hostname: string): boolean {
  return PRIVATE_IP_RANGES.some((re) => re.test(hostname));
}

/**
 * Verifica se o hostname pertence a um domínio de marketplace permitido.
 */
export function isAllowedMarketplaceDomain(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_DESTINATION_DOMAINS.some(
    (allowed) => h === allowed || h.endsWith("." + allowed)
  );
}

function detectMarketplace(hostname: string): UrlResolveResult["marketplace"] {
  const h = hostname.toLowerCase();
  if (h.includes("shopee")) return "Shopee";
  if (h.includes("mercadolivre") || h.includes("mercadolibre") || h === "meli.la") return "Mercado Livre";
  if (h.includes("shein")) return "Shein";
  return "Outro";
}

// ─── Domínios de relay (short-link, requerem mais um salto) ──────────────────
// Esses domínios não são "destino final" — precisamos continuar iterando até
// aterrissar em mercadolivre.com.br, shopee.com.br, etc.
const RELAY_DOMAINS = [
  "meli.la",
  "s.shopee.com.br",
  "onelink.shein.com",
];

function isRelayDomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return RELAY_DOMAINS.some((r) => h === r || h.endsWith("." + r));
}

// ─── Resolvedor Principal ────────────────────────────────────────────────────

/**
 * Resolve uma URL de marketplace seguindo redirects de forma segura.
 *
 * Estratégia:
 * 1. Valida protocolo e hostname de entrada (SSRF)
 * 2. Faz fetch com redirect:follow — response.url é a URL após todos os HTTP redirects
 * 3. Domínios relay (meli.la, s.shopee.com.br) continuam iterando até destino final
 * 4. Detecta loops verificando finalUrl contra o conjunto de URLs já visitadas
 * 5. Retorna a URL final + cadeia de redirects + HTML da página final
 */
export async function resolveMarketplaceUrl(
  inputUrl: string,
  options: UrlResolveOptions = {}
): Promise<UrlResolveResult> {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS_DEFAULT;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS_DEFAULT;

  // ─── Validação de entrada ────────────────────────────────────────────────

  let parsedInput: URL;
  try {
    parsedInput = new URL(inputUrl);
  } catch {
    return { resolvedUrl: inputUrl, redirectChain: [], errorCode: "INVALID_INPUT_URL" };
  }

  // Bloquear protocolos não-HTTP
  if (parsedInput.protocol !== "http:" && parsedInput.protocol !== "https:") {
    return { resolvedUrl: inputUrl, redirectChain: [], errorCode: "SSRF_BLOCKED" };
  }

  // Bloquear IPs privados na URL de entrada
  if (isPrivateIp(parsedInput.hostname)) {
    return { resolvedUrl: inputUrl, redirectChain: [], errorCode: "SSRF_BLOCKED" };
  }

  // ─── Resolução iterativa com detecção de loop ─────────────────────────────

  const redirectChain: string[] = [];
  // visitedUrls rastreia toda URL que já usamos como ponto de partida de um fetch.
  // Ao detectar que finalUrl já foi visitado, temos um ciclo.
  const visitedUrls = new Set<string>();
  let currentUrl = inputUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const normalizedCurrent = currentUrl.split("#")[0];

    // Loop: currentUrl já foi ponto de partida → ciclo
    if (visitedUrls.has(normalizedCurrent)) {
      return { resolvedUrl: currentUrl, redirectChain, errorCode: "REDIRECT_LOOP" };
    }
    visitedUrls.add(normalizedCurrent);

    // Verificar limite de saltos
    if (hop === maxRedirects) {
      try {
        const parsed = new URL(currentUrl);
        if (isAllowedMarketplaceDomain(parsed.hostname)) {
          return {
            resolvedUrl: currentUrl,
            redirectChain,
            marketplace: detectMarketplace(parsed.hostname),
          };
        }
      } catch { /* ignorar */ }
      return { resolvedUrl: currentUrl, redirectChain, errorCode: "REDIRECT_LIMIT_EXCEEDED" };
    }

    // Validar hostname atual antes de fazer fetch (SSRF)
    try {
      const parsed = new URL(currentUrl);
      if (isPrivateIp(parsed.hostname)) {
        return { resolvedUrl: currentUrl, redirectChain, errorCode: "SSRF_BLOCKED" };
      }
    } catch {
      return { resolvedUrl: currentUrl, redirectChain, errorCode: "INVALID_INPUT_URL" };
    }

    // Fazer fetch — Node.js segue HTTP redirects automaticamente; response.url é a URL final
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "TimeoutError") {
        return { resolvedUrl: currentUrl, redirectChain, errorCode: "TIMEOUT_RESOLVING_URL" };
      }
      return { resolvedUrl: currentUrl, redirectChain, errorCode: "EMPTY_RESPONSE" };
    }

    const finalUrl = response.url || currentUrl;

    // URL mudou após o fetch (redirect HTTP seguido automaticamente)
    if (finalUrl !== currentUrl) {
      redirectChain.push(currentUrl);
    }

    // Validar domínio destino
    let finalParsed: URL;
    try {
      finalParsed = new URL(finalUrl);
    } catch {
      return { resolvedUrl: finalUrl, redirectChain, errorCode: "INVALID_INPUT_URL" };
    }

    // SSRF via redirect
    if (isPrivateIp(finalParsed.hostname)) {
      return { resolvedUrl: finalUrl, redirectChain, errorCode: "SSRF_BLOCKED" };
    }

    // Domínio não autorizado
    if (!isAllowedMarketplaceDomain(finalParsed.hostname)) {
      return { resolvedUrl: finalUrl, redirectChain, errorCode: "UNEXPECTED_REDIRECT_DOMAIN" };
    }

    // URL não mudou (fetch não fez redirect) → destino estável, retornar
    if (finalUrl === currentUrl) {
      let htmlBody: string | undefined;
      try { htmlBody = await response.text(); } catch { /* ignorar */ }
      return {
        resolvedUrl: finalUrl,
        redirectChain,
        marketplace: detectMarketplace(finalParsed.hostname),
        htmlBody,
      };
    }

    // ─── URL mudou ─────────────────────────────────────────────────────────

    // Verificar se finalUrl já foi visitado antes de continuar (detecção de ciclo)
    const normalizedFinal = finalUrl.split("#")[0];
    if (visitedUrls.has(normalizedFinal)) {
      return { resolvedUrl: finalUrl, redirectChain, errorCode: "REDIRECT_LOOP" };
    }

    // Destino final (não é relay): capturar HTML e retornar
    if (!isRelayDomain(finalParsed.hostname)) {
      let htmlBody: string | undefined;
      try { htmlBody = await response.text(); } catch { /* ignorar */ }
      return {
        resolvedUrl: finalUrl,
        redirectChain,
        marketplace: detectMarketplace(finalParsed.hostname),
        htmlBody,
      };
    }

    // É um relay domain (ex: meli.la/loop2) → continuar iterando para buscar o destino real
    currentUrl = finalUrl;
  }

  return { resolvedUrl: currentUrl, redirectChain, errorCode: "REDIRECT_LIMIT_EXCEEDED" };
}

