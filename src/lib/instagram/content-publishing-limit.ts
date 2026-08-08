const FACEBOOK_GRAPH_API_VERSION = "v19.0";
const BASE_GRAPH_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}`;

export type InstagramContentPublishingLimit =
  | { available: true; quotaUsage: number; quotaTotal: number }
  | { available: false };

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchInstagramContentPublishingLimit(
  instagramUserId: string,
  accessToken: string,
  fetcher: FetchLike = fetch
): Promise<InstagramContentPublishingLimit> {
  try {
    const url = new URL(`${BASE_GRAPH_URL}/${instagramUserId}/content_publishing_limit`);
    url.searchParams.set("fields", "quota_usage,config");
    url.searchParams.set("access_token", accessToken);
    const response = await fetcher(url);
    if (!response.ok) return { available: false };
    const payload = await response.json() as {
      data?: Array<{ quota_usage?: unknown; quota_total?: unknown; config?: { quota_total?: unknown } }>;
      quota_usage?: unknown;
      quota_total?: unknown;
      config?: { quota_total?: unknown };
    };
    const current = payload.data?.[0] ?? payload;
    const quotaUsage = Number(current.quota_usage);
    const quotaTotal = Number(current.quota_total ?? current.config?.quota_total);
    if (!Number.isFinite(quotaUsage) || !Number.isFinite(quotaTotal) || quotaUsage < 0 || quotaTotal <= 0) {
      return { available: false };
    }
    return { available: true, quotaUsage, quotaTotal };
  } catch {
    return { available: false };
  }
}
