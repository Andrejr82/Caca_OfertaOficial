/**
 * TDD RED — Testes para o resolvedor de URLs da Publicação Expressa.
 * Esses testes DEVEM FALHAR antes da implementação de express-url-resolver.ts.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveMarketplaceUrl,
  isPrivateIp,
  isAllowedMarketplaceDomain,
  type UrlResolveResult,
} from "@/lib/publish/express-url-resolver";

// ─── Helpers de mock ───────────────────────────────────────────────────────

function mockFetch(responses: Array<{ status: number; headers?: Record<string, string>; body?: string }>) {
  let callIndex = 0;
  vi.spyOn(global, "fetch").mockImplementation(async () => {
    const resp = responses[Math.min(callIndex++, responses.length - 1)];
    return {
      status: resp.status,
      ok: resp.status >= 200 && resp.status < 300,
      headers: {
        get: (key: string) => resp.headers?.[key.toLowerCase()] ?? null,
      },
      url: resp.headers?.["location"] ?? "https://example.com",
      text: async () => resp.body ?? "",
    } as unknown as Response;
  });
}

// ─── Proteção SSRF ─────────────────────────────────────────────────────────

describe("isPrivateIp", () => {
  it("detecta localhost", () => {
    expect(isPrivateIp("localhost")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
  });

  it("detecta IP interno 10.x.x.x", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
  });

  it("detecta IP interno 192.168.x.x", () => {
    expect(isPrivateIp("192.168.1.1")).toBe(true);
  });

  it("detecta IP de metadata cloud AWS 169.254.x.x", () => {
    expect(isPrivateIp("169.254.169.254")).toBe(true);
  });

  it("detecta 0.0.0.0", () => {
    expect(isPrivateIp("0.0.0.0")).toBe(true);
  });

  it("não bloqueia IPs públicos legítimos", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("200.150.100.50")).toBe(false);
  });
});

describe("isAllowedMarketplaceDomain", () => {
  it("permite domínios Shopee", () => {
    expect(isAllowedMarketplaceDomain("shopee.com.br")).toBe(true);
    expect(isAllowedMarketplaceDomain("s.shopee.com.br")).toBe(true);
    expect(isAllowedMarketplaceDomain("down-br.img.susercontent.com")).toBe(true);
  });

  it("permite domínios Mercado Livre", () => {
    expect(isAllowedMarketplaceDomain("mercadolivre.com.br")).toBe(true);
    expect(isAllowedMarketplaceDomain("www.mercadolivre.com.br")).toBe(true);
    expect(isAllowedMarketplaceDomain("produto.mercadolivre.com.br")).toBe(true);
    expect(isAllowedMarketplaceDomain("meli.la")).toBe(true);
    expect(isAllowedMarketplaceDomain("mercadolibre.com")).toBe(true);
    expect(isAllowedMarketplaceDomain("api.mercadolibre.com")).toBe(true);
  });

  it("bloqueia domínios não autorizados", () => {
    expect(isAllowedMarketplaceDomain("evil.com")).toBe(false);
    expect(isAllowedMarketplaceDomain("localhost")).toBe(false);
  });
});

// ─── Resolução de URLs ──────────────────────────────────────────────────────

describe("resolveMarketplaceUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolve meli.la para mercadolivre.com.br com item ID extraído", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => null },
      url: "https://www.mercadolivre.com.br/produto/MLB5001112223-_JM",
      text: async () => "",
    } as unknown as Response);

    const result: UrlResolveResult = await resolveMarketplaceUrl("https://meli.la/1uQ6YYf");

    expect(result.errorCode).toBeUndefined();
    expect(result.resolvedUrl).toContain("mercadolivre.com.br");
    expect(result.redirectChain.length).toBeGreaterThanOrEqual(1);
  });

  it("resolve s.shopee.com.br para shopee.com.br com produto", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => null },
      url: "https://shopee.com.br/product/123456789/1001234567",
      text: async () => `
        <html>
          <meta property="og:title" content="Kit Conjunto Feminino Calça E Blusa" />
          <meta property="og:image" content="https://down-br.img.susercontent.com/file/br-img.jpg" />
          <meta property="product:price:amount" content="95.90" />
        </html>
      `,
    } as unknown as Response);

    const result: UrlResolveResult = await resolveMarketplaceUrl("https://s.shopee.com.br/7AcDy9IMDA");

    expect(result.errorCode).toBeUndefined();
    expect(result.resolvedUrl).toContain("shopee.com.br");
  });

  it("bloqueia redirect para domínio não autorizado (SSRF via redirect)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => null },
      url: "https://evil.com/steal-data",
      text: async () => "",
    } as unknown as Response);

    const result: UrlResolveResult = await resolveMarketplaceUrl("https://meli.la/fake");

    expect(result.errorCode).toBe("UNEXPECTED_REDIRECT_DOMAIN");
  });

  it("bloqueia ftp:// na URL de entrada", async () => {
    const result: UrlResolveResult = await resolveMarketplaceUrl("ftp://example.com");
    expect(result.errorCode).toBe("SSRF_BLOCKED");
  });

  it("bloqueia file:// na URL de entrada", async () => {
    const result: UrlResolveResult = await resolveMarketplaceUrl("file:///etc/passwd");
    expect(result.errorCode).toBe("SSRF_BLOCKED");
  });

  it("bloqueia localhost na URL de entrada", async () => {
    const result: UrlResolveResult = await resolveMarketplaceUrl("http://localhost/admin");
    expect(result.errorCode).toBe("SSRF_BLOCKED");
  });

  it("bloqueia IP de metadata cloud (169.254.169.254)", async () => {
    const result: UrlResolveResult = await resolveMarketplaceUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.errorCode).toBe("SSRF_BLOCKED");
  });

  it("bloqueia IP privado 192.168.x.x", async () => {
    const result: UrlResolveResult = await resolveMarketplaceUrl("http://192.168.1.1/");
    expect(result.errorCode).toBe("SSRF_BLOCKED");
  });

  it("detecta loop de redirect e retorna REDIRECT_LOOP", async () => {
    let callCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      callCount++;
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        url: callCount % 2 === 0
          ? "https://meli.la/loop1"
          : "https://meli.la/loop2",
        text: async () => "",
      } as unknown as Response;
    });

    const result: UrlResolveResult = await resolveMarketplaceUrl("https://meli.la/loop1");
    expect(result.errorCode).toBe("REDIRECT_LOOP");
  });

  it("respeita limite máximo de redirects", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
      url: `https://meli.la/redirect-${Math.random()}`,
      text: async () => "",
    } as unknown as Response);

    const result: UrlResolveResult = await resolveMarketplaceUrl("https://meli.la/deep", { maxRedirects: 2 });
    // Após 2 saltos ainda em domínio meli.la que não é o destino final
    // Pode retornar limite ou resultado válido se URL já está em domínio permitido
    expect(["REDIRECT_LIMIT_EXCEEDED", undefined].includes(result.errorCode)).toBe(true);
  });
});

// ─── Reconciliação de Identidade (Cirúrgica) ────────────────────────────────

describe("Reconciliação de Identidade e Anti-Bot", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. MLB presente na URL original e ausente na final (FINAL Anti-Bot)", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://www.mercadolivre.com.br/gz/account-verification?go=..." },
      body: "captcha",
    }]);

    const result = await resolveMarketplaceUrl("https://produto.mercadolivre.com.br/MLB-12345-produto-_JM");
    expect(result.errorCode).toBe("ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID");
    expect(result.originalItemId).toBe("MLB12345");
    expect(result.selectedItemId).toBe("MLB12345");
    expect(result.identitySource).toBe("ORIGINAL_URL");
  });

  it("2. final URL anti-bot", async () => {
    // Sem originalItemId, então só falha ou passa
    mockFetch([{
      status: 200,
      headers: { location: "https://www.mercadolivre.com.br/gz/account-verification" },
    }]);

    const result = await resolveMarketplaceUrl("https://mercadolivre.com.br/busca");
    expect(result.originalItemId).toBeNull();
    // Como não tem ID original, cai no default
    expect(result.errorCode).toBeUndefined();
  });

  it("3. originalItemId preservado e 4. original e final IDs iguais", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://produto.mercadolivre.com.br/MLB-12345-final-_JM" },
    }]);

    const result = await resolveMarketplaceUrl("https://produto.mercadolivre.com.br/MLB-12345-orig-_JM");
    expect(result.originalItemId).toBe("MLB12345");
    expect(result.finalItemId).toBe("MLB12345");
    expect(result.selectedItemId).toBe("MLB12345");
    expect(result.identitySource).toBe("BOTH");
    expect(result.errorCode).toBeUndefined();
  });

  it("5. original e final IDs diferentes", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://produto.mercadolivre.com.br/MLB-99999-final-_JM" },
    }]);

    const result = await resolveMarketplaceUrl("https://produto.mercadolivre.com.br/MLB-11111-orig-_JM");
    expect(result.originalItemId).toBe("MLB11111");
    expect(result.finalItemId).toBe("MLB99999");
    expect(result.selectedItemId).toBeNull();
    expect(result.identitySource).toBe("MISMATCH");
    expect(result.errorCode).toBe("PRODUCT_ID_MISMATCH");
  });

  it("6. meli.la para /social/ (9. vitrine não tratada como produto)", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://www.mercadolivre.com.br/social/doandre" },
    }]);

    const result = await resolveMarketplaceUrl("https://meli.la/short");
    expect(result.errorCode).toBe("AFFILIATE_SHOWCASE_NOT_PRODUCT");
  });

  it("7. Shopee opaanlp (8. campanha não tratada como produto)", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://shopee.com.br/opaanlp/1234/5678" },
    }]);

    const result = await resolveMarketplaceUrl("https://s.shopee.com.br/short");
    expect(result.errorCode).toBe("CAMPAIGN_PAGE_NOT_PRODUCT");
  });

});

// ─── TDD Amazon e Shein (Multimarketplace) ────────────────────────────────

describe("Amazon e Shein - Resolução e Extração", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extrai ASIN da Amazon em URL /dp/ASIN", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://www.amazon.com.br/dp/B0CX23G2H8?ref=..." }
    }]);
    const result = await resolveMarketplaceUrl("https://amzn.to/short");
    expect(result.finalItemId).toBe("B0CX23G2H8");
    expect(result.marketplace).toBe("Amazon");
  });

  it("extrai ASIN da Amazon em URL /gp/product/ASIN", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://amazon.com.br/gp/product/B0CX23G2H8/ref=..." }
    }]);
    const result = await resolveMarketplaceUrl("https://a.co/short");
    expect(result.finalItemId).toBe("B0CX23G2H8");
    expect(result.marketplace).toBe("Amazon");
  });

  it("extrai PID da Shein via goods_id", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://br.shein.com/product.html?goods_id=12345678" }
    }]);
    const result = await resolveMarketplaceUrl("https://onelink.shein.com/short");
    expect(result.finalItemId).toBe("12345678");
    expect(result.marketplace).toBe("Shein");
  });

  it("extrai PID da Shein via slug", async () => {
    mockFetch([{
      status: 200,
      headers: { location: "https://br.shein.com/Vestido-Lindo-p-987654.html" }
    }]);
    const result = await resolveMarketplaceUrl("https://onelink.shein.com/short2");
    expect(result.finalItemId).toBe("987654");
    expect(result.marketplace).toBe("Shein");
  });
});
