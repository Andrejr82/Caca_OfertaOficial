import { isPrivateIpAddress, isAllowedRedirectHost, validateSourceUrl } from "./source-policy";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ImportedVideoSource = {
  sourceUrl: string;
  resolvedPageUrl: string;
  mediaUrl: string;
  sourcePlatform: "shopee";
  redirects: number;
};

export class SourceResolutionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SourceResolutionError";
  }
}

type ResolverOptions = {
  fetchImpl?: FetchLike;
  resolveHost?: (hostname: string) => Promise<string[]>;
  maxRedirects?: number;
  timeoutMs?: number;
};

const defaultResolveHost = async (hostname: string) => {
  const dns = await import("node:dns/promises");
  const records = await dns.lookup(hostname, { all: true });
  return records.map((record) => record.address);
};

function isApprovedPageHost(hostname: string) {
  return ["br.shp.ee", "s.shopee.com.br", "shopee.com.br", "sv.shopee.com.br"].some((host) => isAllowedRedirectHost(hostname, [host]));
}

function isApprovedMediaHost(hostname: string) {
  return /^[a-z0-9-]+\.vod\.susercontent\.com$/i.test(hostname);
}

async function assertPublicHost(url: URL, resolveHost: (hostname: string) => Promise<string[]>) {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new SourceResolutionError("REDIRECT_HOST_NOT_ALLOWED", "Destino de redirect não autorizado.");
  }
  const addresses = await resolveHost(url.hostname);
  if (!addresses.length || addresses.some((address) => isPrivateIpAddress(address))) {
    throw new SourceResolutionError("SSRF_BLOCKED", "Destino resolve para rede não pública.");
  }
}

function extractMediaUrl(html: string) {
  const matches = html.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)(?:\?[^"'\s<>]*)?/gi) ?? [];
  return matches.find((candidate) => {
    try {
      const url = new URL(candidate);
      return url.protocol === "https:" && isApprovedMediaHost(url.hostname);
    } catch {
      return false;
    }
  });
}

export async function resolveImportedVideoSource(sourceUrl: string, options: ResolverOptions = {}): Promise<ImportedVideoSource> {
  const policy = validateSourceUrl(sourceUrl);
  if (!policy.ok) throw new SourceResolutionError(policy.code, "URL de origem não autorizada.");

  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 15000;
  let current = new URL(sourceUrl);
  let redirects = 0;

  while (true) {
    await assertPublicHost(current, resolveHost);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "caca-oferta-authorized-video-import/1.0", accept: "text/html,video/mp4" }
      });
    } catch (error) {
      if (error instanceof SourceResolutionError) throw error;
      throw new SourceResolutionError("SOURCE_FETCH_FAILED", error instanceof Error ? error.message : "Falha ao acessar origem.");
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirects >= maxRedirects) throw new SourceResolutionError("REDIRECT_LIMIT", "Quantidade máxima de redirects excedida.");
      const location = response.headers.get("location");
      if (!location) throw new SourceResolutionError("REDIRECT_LOCATION_MISSING", "Redirect sem destino.");
      const next = new URL(location, current);
      if (!isApprovedPageHost(next.hostname) && !isApprovedMediaHost(next.hostname)) {
        throw new SourceResolutionError("REDIRECT_HOST_NOT_ALLOWED", "Redirect para host não autorizado.");
      }
      current = next;
      redirects += 1;
      continue;
    }

    if (!response.ok) throw new SourceResolutionError("SOURCE_FETCH_FAILED", `Origem respondeu HTTP ${response.status}.`);
    const mediaUrl = response.headers.get("content-type")?.toLowerCase().startsWith("video/")
      ? current.toString()
      : extractMediaUrl(await response.text());
    if (!mediaUrl) throw new SourceResolutionError("MEDIA_URL_NOT_FOUND", "Página não expôs recurso de vídeo permitido.");
    return {
      sourceUrl,
      resolvedPageUrl: current.toString(),
      mediaUrl,
      sourcePlatform: "shopee",
      redirects
    };
  }
}
