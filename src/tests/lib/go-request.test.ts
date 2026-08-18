import { describe, expect, it } from "vitest";
import {
  isNonHumanTraffic,
  isPreviewCrawler,
  resolveGoAffiliateDestination,
} from "@/lib/tracking/go-request";

describe("/go request classification", () => {
  it("detecta crawlers de preview usados por redes sociais", () => {
    expect(isPreviewCrawler("WhatsApp/2.24.1")).toBe(true);
    expect(isPreviewCrawler("facebookexternalhit/1.1")).toBe(true);
    expect(isPreviewCrawler("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isPreviewCrawler("Slackbot-LinkExpanding 1.0")).toBe(true);
  });

  it("não classifica browser humano como crawler", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    expect(isPreviewCrawler(chrome)).toBe(false);
    expect(isNonHumanTraffic(chrome)).toBe(false);
  });

  it("não conta crawlers de busca como tráfego humano", () => {
    expect(isNonHumanTraffic("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isNonHumanTraffic("bingbot/2.0")).toBe(true);
    expect(isNonHumanTraffic("Applebot/0.1")).toBe(true);
  });
});

describe("/go affiliate destination", () => {
  it("preserva byte a byte o affiliateUrl HTTP(S) persistido", () => {
    const meli = "https://meli.la/12hoKT9";
    const full = "https://www.mercadolivre.com.br/produto?p=1&matt_tool=38524122&ua=ABC#origin=share";
    expect(resolveGoAffiliateDestination(meli)).toBe(meli);
    expect(resolveGoAffiliateDestination(full)).toBe(full);
  });

  it("rejeita destino vazio, inválido ou com protocolo não web", () => {
    expect(resolveGoAffiliateDestination("")).toBeNull();
    expect(resolveGoAffiliateDestination("javascript:alert(1)")).toBeNull();
    expect(resolveGoAffiliateDestination("mercadolivre.com.br/produto")).toBeNull();
  });
});
