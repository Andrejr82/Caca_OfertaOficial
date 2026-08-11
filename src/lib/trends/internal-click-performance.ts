import { buildInternalClickSignals, type InternalClickSignal } from "@/core/trends/internal-click-performance";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const QUERY_CHUNK_SIZE = 100;

type QueryError = { message: string };

type ClickRow = { id: string; affiliate_link_id: string; created_at: string };
type LinkRow = { id: string; offer_id: string; channel: string };
type OfferRow = { id: string; platform: string; product_name: string; category: string | null };
type PostRow = { id: string; affiliate_link_id: string | null; channel: string; status: string; deleted_at: string | null };

interface InternalClickPerformanceClient {
  from(table: string): any;
}

function chunks<T>(values: T[], size = QUERY_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function selectByIds<T>(
  client: InternalClickPerformanceClient,
  table: string,
  columns: string,
  column: string,
  ids: string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (const batch of chunks([...new Set(ids)])) {
    const { data, error } = await client.from(table).select(columns).in(column, batch) as { data: T[] | null; error: QueryError | null };
    if (error) throw new Error(`Falha ao carregar ${table} para performance interna.`);
    rows.push(...(data ?? []));
  }
  return rows;
}

export async function loadInternalClickSignals(
  client: InternalClickPerformanceClient,
  windowStart: string,
  windowEnd: string,
): Promise<InternalClickSignal[]> {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("Janela de performance interna inválida.");
  }

  const { data: clickRows, error: clickError } = await client
    .from("click_events")
    .select("id,affiliate_link_id,created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true }) as { data: ClickRow[] | null; error: QueryError | null };
  if (clickError) throw new Error("Falha ao carregar click_events para performance interna.");
  if (!clickRows?.length) return [];

  const linkIds = [...new Set(clickRows.map((row) => row.affiliate_link_id))];
  const links = await selectByIds<LinkRow>(client, "affiliate_links", "id,offer_id,channel", "id", linkIds);
  const offerIds = [...new Set(links.map((row) => row.offer_id))];
  const offers = await selectByIds<OfferRow>(client, "offers", "id,platform,product_name,category", "id", offerIds);
  const posts = await selectByIds<PostRow>(client, "posts", "id,affiliate_link_id,channel,status,deleted_at", "affiliate_link_id", linkIds);

  return buildInternalClickSignals({
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    clickEvents: clickRows.map((row) => ({ id: row.id, affiliateLinkId: row.affiliate_link_id, createdAt: row.created_at })),
    affiliateLinks: links.map((row) => ({ id: row.id, offerId: row.offer_id, channel: row.channel })),
    offers: offers.map((row) => ({ id: row.id, platform: row.platform, productName: row.product_name, category: row.category })),
    posts: posts.map((row) => ({ id: row.id, affiliateLinkId: row.affiliate_link_id, channel: row.channel, status: row.status, deletedAt: row.deleted_at })),
  });
}

export async function listInternalClickSignals(
  windowStart: string,
  windowEnd: string,
): Promise<InternalClickSignal[]> {
  const client = await createServerSupabaseClient();
  if (!client) return [];
  return loadInternalClickSignals(client as unknown as InternalClickPerformanceClient, windowStart, windowEnd);
}
