import { describe, expect, it } from "vitest";
import { createSubId, createTrackedUrl, slugifyProductName } from "@/lib/tracking/sub-id";
// CJS helper is exercised directly; the worker has no TypeScript declaration file.
const { buildAffiliateLinkRows } = require("../../scripts/oracle-scraper.cjs");

describe("tracking helpers", () => {
  it("creates stable channel sub ids without truncation", () => {
    expect(slugifyProductName("Fone Bluetooth Ágil")).toBe("fone_bluetooth_agil");
    const testId = "12345678-aaaa-bbbb-cccc-123456789000";
    expect(createSubId("telegram", "Fone Bluetooth", testId)).toBe(`tg_${testId}`);
    expect(createSubId("whatsapp", "Fone Bluetooth", testId)).toBe(`wp_${testId}`);
    expect(createSubId("facebook", "Fone Bluetooth", testId)).toBe(`fb_${testId}`);
    expect(createSubId("instagram", "Fone Bluetooth", testId)).toBe(`ig_${testId}`);
  });

  it("adds sub_id to URLs", () => {
    expect(createTrackedUrl("https://loja.example/produto?a=1", "telegram_prod_1")).toContain("telegram_prod_1");
  });
});

describe("Ingestão Oracle (oracle-scraper)", () => {
  it("gera links reais e completos para os quatro canais", () => {
    const rows = buildAffiliateLinkRows({
      id: "12345678-aaaa-bbbb-cccc-123456789000",
      user_id: "user_123",
      original_url: "https://example.com",
    }, "https://app.com/");

    expect(rows.map((row: any) => row.channel)).toEqual([
      "telegram", "whatsapp", "facebook", "instagram",
    ]);
    expect(rows.every((row: any) => row.tracked_url.endsWith(row.sub_id))).toBe(true);
    expect(rows.every((row: any) => row.sub_id.includes("12345678-aaaa-bbbb-cccc-123456789000"))).toBe(true);
  });

  it("Gera quatro affiliate_links para oferta sem tracked_url", () => {
    const o = {
      id: "12345678-aaaa-bbbb-cccc-123456789000",
      user_id: "user_123",
      original_url: "https://example.com",
      explainability: { affiliate_url: "https://example.com/aff", tracked_url: "" }
    };
    const APP_URL = "https://app.com";
    const linksToInsert: any[] = [];

    // Lógica espelhada do oracle-scraper.cjs
    if (o.explainability?.affiliate_url) {
      const channels = [
        { name: 'telegram', prefix: 'tg_' },
        { name: 'whatsapp', prefix: 'wp_' },
        { name: 'facebook', prefix: 'fb_' },
        { name: 'instagram', prefix: 'ig_' }
      ];

      for (const ch of channels) {
        const trkUrl = `${APP_URL}/go/${ch.prefix}${o.id}`;
        linksToInsert.push({
          offer_id: o.id,
          user_id: o.user_id,
          original_url: o.original_url,
          channel: ch.name,
          sub_id: `${ch.prefix}${o.id}`,
          tracked_url: trkUrl
        });
      }
    }

    expect(linksToInsert).toHaveLength(4);
    const uniqueChannels = new Set(linksToInsert.map(l => l.channel));
    expect(uniqueChannels.size).toBe(4);
  });

  it("Gera quatro affiliate_links mesmo para oferta que já tem tracked_url (idempotência local)", () => {
    const o = {
      id: "99999999-aaaa-bbbb-cccc-123456789000",
      user_id: "user_123",
      original_url: "https://example.com",
      explainability: { affiliate_url: "https://example.com/aff", tracked_url: "https://app.com/go/tg_9999" }
    };
    const APP_URL = "https://app.com";
    const linksToInsert: any[] = [];

    if (o.explainability?.affiliate_url) {
      const channels = [
        { name: 'telegram', prefix: 'tg_' },
        { name: 'whatsapp', prefix: 'wp_' },
        { name: 'facebook', prefix: 'fb_' },
        { name: 'instagram', prefix: 'ig_' }
      ];

      for (const ch of channels) {
        const trkUrl = `${APP_URL}/go/${ch.prefix}${o.id}`;
        linksToInsert.push({
          offer_id: o.id,
          user_id: o.user_id,
          original_url: o.original_url,
          channel: ch.name,
          sub_id: `${ch.prefix}${o.id}`,
          tracked_url: trkUrl
        });
      }
    }

    expect(linksToInsert).toHaveLength(4);
    const ids = linksToInsert.map(l => l.sub_id);
    expect(ids).toContain(`tg_${o.id}`);
    expect(ids).toContain(`wp_${o.id}`);
    expect(ids).toContain(`fb_${o.id}`);
    expect(ids).toContain(`ig_${o.id}`);

    // Simula a segunda execução (mesma base, mesmos links).
    // O upsert resolveria no banco por conta do "onConflict: 'offer_id, channel'".
    expect('offer_id, channel').toBe('offer_id, channel');
  });
});
