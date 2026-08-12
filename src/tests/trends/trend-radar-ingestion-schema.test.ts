import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260811010000_trend_radar_offer_ingestion_v2.sql", "utf8");

describe("trend radar ingestion v2 schema", () => {
  it("supports both marketplaces and delegates canonical conflict resolution", () => {
    expect(sql).toMatch(/create or replace function public\.upsert_trend_radar_offers_v2/i);
    expect(sql).toMatch(/p_marketplace not in \('Shopee', 'Mercado Livre'\)/i);
    expect(sql).toMatch(/upsert_trend_radar_offers_v1\(p_marketplace, p_rows\)/i);
    expect(sql).toMatch(/platform = 'Shopee' and shopee_item_id/i);
    expect(sql).toMatch(/platform = 'Mercado Livre'/i);
  });

  it("changes only new rows to manual review and restricts the privileged RPC", () => {
    expect(sql).toMatch(/set status = 'pending_manual_review'/i);
    expect(sql).toMatch(/id <> all\(v_existing_ids\)/i);
    expect(sql).toMatch(/revoke all on function public\.upsert_trend_radar_offers_v2/i);
    expect(sql).toMatch(/grant execute on function public\.upsert_trend_radar_offers_v2\(text, jsonb\) to service_role/i);
  });
});
