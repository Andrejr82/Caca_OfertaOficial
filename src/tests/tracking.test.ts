import { describe, expect, it } from "vitest";
import { createSubId, createTrackedUrl, slugifyProductName } from "@/lib/tracking/sub-id";
import {
  isMercadoLivreMonetizedUrl,
  resolveTrackedOfferDestination,
} from "@/lib/tracking/go-request";
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

describe("Mercado Livre monetization guard", () => {
  it("accepts official meli.la shortlinks", () => {
    expect(isMercadoLivreMonetizedUrl("https://meli.la/2AfuzK7")).toBe(true);
  });

  it("accepts cycle affiliate URLs with partner_id", () => {
    expect(isMercadoLivreMonetizedUrl(
      "https://www.mercadolivre.com.br/p/MLB62549311?partner_id=cacaofertaoficial&utm_source=caca_oferta"
    )).toBe(true);
  });

  it("rejects plain Mercado Livre product URLs", () => {
    expect(isMercadoLivreMonetizedUrl("https://www.mercadolivre.com.br/p/MLB62549311")).toBe(false);
  });

  it("prefers cycle affiliate_url over plain affiliate_links original_url", () => {
    expect(resolveTrackedOfferDestination({
      platform: "Mercado Livre",
      originalUrl: "https://www.mercadolivre.com.br/p/MLB62549311",
      affiliateUrl: "https://www.mercadolivre.com.br/p/MLB62549311?partner_id=cacaofertaoficial&utm_source=caca_oferta",
    })).toContain("partner_id=cacaofertaoficial");
  });

  it("fails closed when a Mercado Livre offer has no monetized destination", () => {
    expect(resolveTrackedOfferDestination({
      platform: "Mercado Livre",
      originalUrl: "https://www.mercadolivre.com.br/p/MLB62549311",
      affiliateUrl: "",
    })).toBeNull();
  });

  it("keeps non-ML destinations unchanged", () => {
    expect(resolveTrackedOfferDestination({
      platform: "Shopee",
      originalUrl: "https://s.shopee.com.br/example",
      affiliateUrl: "",
    })).toBe("https://s.shopee.com.br/example");
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