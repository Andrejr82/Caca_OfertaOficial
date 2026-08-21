export type StoryPublishChannel = "instagram" | "facebook";

const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

type FetchLike = typeof fetch;

type MetaError = { error?: { message?: string; code?: number }; id?: string; post_id?: string; success?: boolean };

async function readMetaJson(response: Response, step: string): Promise<MetaError> {
  const raw = await response.text();
  let parsed: MetaError;
  try {
    parsed = JSON.parse(raw) as MetaError;
  } catch {
    throw new Error(`${step}: resposta inválida da Meta.`);
  }
  if (!response.ok || parsed.error) {
    throw new Error(`${step}: ${parsed.error?.message || `HTTP ${response.status}`}`);
  }
  return parsed;
}

async function discoverInstagramBusinessId(token: string, fetcher: FetchLike) {
  if (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim()) return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID.trim();
  const accounts = await fetcher(`${GRAPH_BASE}/me/accounts?fields=id,instagram_business_account&access_token=${encodeURIComponent(token)}`);
  const raw = await accounts.text();
  let data: { data?: Array<{ id?: string; instagram_business_account?: { id?: string } }>; error?: { message?: string } };
  try { data = JSON.parse(raw); } catch { throw new Error("Instagram: resposta inválida ao descobrir conta Business."); }
  if (!accounts.ok || data.error) throw new Error(`Instagram: ${data.error?.message || `HTTP ${accounts.status}`}`);
  const id = data.data?.find((page) => page.instagram_business_account?.id)?.instagram_business_account?.id;
  if (!id) throw new Error("Instagram Business não encontrado para o token configurado.");
  return id;
}

async function resolveFacebookPageAccessToken(pageId: string, fetcher: FetchLike) {
  const explicitPageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (explicitPageToken) return explicitPageToken;

  const genericToken = process.env.FACEBOOK_ACCESS_TOKEN?.trim();
  if (!genericToken) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN ou FACEBOOK_ACCESS_TOKEN não configurado.");

  const meResponse = await fetcher(`${GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(genericToken)}`);
  const meRaw = await meResponse.text();
  let me: { id?: string; error?: { message?: string } };
  try { me = JSON.parse(meRaw); } catch { throw new Error("Facebook token: resposta inválida ao identificar o token."); }
  if (!meResponse.ok || me.error) throw new Error(`Facebook token: ${me.error?.message || `HTTP ${meResponse.status}`}`);

  if (me.id === pageId) return genericToken;

  const accountsResponse = await fetcher(`${GRAPH_BASE}/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(genericToken)}`);
  const accountsRaw = await accountsResponse.text();
  let accounts: { data?: Array<{ id?: string; access_token?: string }>; error?: { message?: string } };
  try { accounts = JSON.parse(accountsRaw); } catch { throw new Error("Facebook Pages: resposta inválida ao descobrir Page access token."); }
  if (!accountsResponse.ok || accounts.error) throw new Error(`Facebook Pages: ${accounts.error?.message || `HTTP ${accountsResponse.status}`}`);

  const pageToken = accounts.data?.find((page) => page.id === pageId)?.access_token;
  if (!pageToken) {
    throw new Error("Facebook Page access token não encontrado para FACEBOOK_PAGE_ID. Configure FACEBOOK_PAGE_ACCESS_TOKEN ou conceda acesso à Página ao token informado.");
  }
  return pageToken;
}

export async function publishInstagramStory(imageUrl: string, fetcher: FetchLike = fetch): Promise<string> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN não configurado.");
  if (!/^https:\/\//iu.test(imageUrl)) throw new Error("Story do Instagram exige imagem HTTPS pública.");

  const accountId = await discoverInstagramBusinessId(token, fetcher);
  const containerResponse = await fetcher(`${GRAPH_BASE}/${accountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "STORIES", image_url: imageUrl, access_token: token }),
  });
  const container = await readMetaJson(containerResponse, "Instagram container");
  if (!container.id) throw new Error("Instagram container: creation id ausente.");

  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    const statusResponse = await fetcher(`${GRAPH_BASE}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    const statusRaw = await statusResponse.text();
    let status: { status_code?: string; status?: string; error?: { message?: string } };
    try { status = JSON.parse(statusRaw); } catch { status = {}; }
    if (!statusResponse.ok || status.error) throw new Error(`Instagram status: ${status.error?.message || `HTTP ${statusResponse.status}`}`);
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR") throw new Error(`Instagram rejeitou o Story: ${status.status || "erro no processamento"}.`);
    if (attempt === 14) throw new Error("Instagram: timeout aguardando processamento do Story.");
  }

  const publishResponse = await fetcher(`${GRAPH_BASE}/${accountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
  });
  const published = await readMetaJson(publishResponse, "Instagram publish");
  if (!published.id) throw new Error("Instagram publish: media id ausente.");
  return published.id;
}

export async function publishFacebookStory(imageUrl: string, fetcher: FetchLike = fetch): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  if (!pageId) throw new Error("FACEBOOK_PAGE_ID não configurado.");
  if (!/^https:\/\//iu.test(imageUrl)) throw new Error("Story do Facebook exige imagem HTTPS pública.");

  const token = await resolveFacebookPageAccessToken(pageId, fetcher);

  const photoResponse = await fetcher(`${GRAPH_BASE}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: imageUrl, published: false, access_token: token }),
  });
  const photo = await readMetaJson(photoResponse, "Facebook upload");
  if (!photo.id) throw new Error("Facebook upload: photo id ausente.");

  const storyResponse = await fetcher(`${GRAPH_BASE}/${pageId}/photo_stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_id: photo.id, access_token: token }),
  });
  const story = await readMetaJson(storyResponse, "Facebook Story");
  const id = story.post_id || photo.id;
  if (!story.success && !story.post_id) throw new Error("Facebook Story: confirmação de publicação ausente.");
  return id;
}

export async function publishStoryToChannel(channel: StoryPublishChannel, imageUrl: string) {
  return channel === "instagram" ? publishInstagramStory(imageUrl) : publishFacebookStory(imageUrl);
}
