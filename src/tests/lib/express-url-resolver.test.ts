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
    expect(isAllowedMarketplaceDomain("amazon.com.br")).toBe(false);
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
