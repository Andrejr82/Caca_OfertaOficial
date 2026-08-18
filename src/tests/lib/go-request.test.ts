import { describe, expect, it } from "vitest";
import {
  isNonHumanTraffic,
  isPreviewCrawler,
  resolveGoAffiliateDestination,
  resolveTrackingSource,
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
  it("preserva byte a byte o affiliateUrl HTTP(S) público persistido", () => {
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

  it("rejeita credenciais embutidas e destinos privados/locais", () => {
    expect(resolveGoAffiliateDestination("https://user:secret@example.com/produto")).toBeNull();
    expect(resolveGoAffiliateDestination("http://localhost:3000/admin")).toBeNull();
    expect(resolveGoAffiliateDestination("http://127.0.0.1/internal")).toBeNull();
    expect(resolveGoAffiliateDestination("http://10.0.0.5/internal")).toBeNull();
    expect(resolveGoAffiliateDestination("http://192.168.1.10/internal")).toBeNull();
    expect(resolveGoAffiliateDestination("http://[::1]/internal")).toBeNull();
  });
});

describe("/go tracking source privacy", () => {
  it("mantém apenas o hostname do referer e remove path/query/token", () => {
    const referer = "https://social.example/post/123?token=segredo&url=https%3A%2F%2Fexample.com";
    expect(resolveTrackingSource(referer, "telegram")).toBe("ref:social.example");
  });

  it("usa o canal quando referer está ausente ou inválido", () => {
    expect(resolveTrackingSource("", "whatsapp")).toBe("whatsapp");
    expect(resolveTrackingSource("not-a-url", "facebook")).toBe("facebook");
  });
});
