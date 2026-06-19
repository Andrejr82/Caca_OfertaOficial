import { generateSheinAffiliateLink } from "@/lib/platforms/shein";

// Mocking dependencies
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: jest.fn().mockResolvedValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      }),
      upsert: jest.fn().mockResolvedValue({ error: null })
    })
  })
}));

describe("Integração Admitad / Shein", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("deve retornar url original se as credenciais não estiverem setadas", async () => {
    process.env.ADMITAD_WEBSITE_ID = "";
    const result = await generateSheinAffiliateLink("https://br.shein.com/test", "user123");
    expect(result).toBe("https://br.shein.com/test");
  });

  it("deve tentar gerar o deeplink quando o website id está presente", async () => {
    // Configura credenciais falsas para forçar a execução até o fetch
    process.env.ADMITAD_CLIENT_ID = "fake-client";
    process.env.ADMITAD_CLIENT_SECRET = "fake-secret";
    process.env.ADMITAD_WEBSITE_ID = "123456";

    // Mock do fetch global
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes("/token/")) {
        return {
          ok: true,
          json: async () => ({ access_token: "fake-token", expires_in: 3600 })
        };
      }
      if (url.includes("/deeplink/")) {
        return {
          ok: true,
          json: async () => (["https://ad.admitad.com/g/fake-link/"])
        };
      }
      return { ok: false };
    }) as jest.Mock;

    const result = await generateSheinAffiliateLink("https://br.shein.com/produto-teste", "user123");
    expect(result).toBe("https://ad.admitad.com/g/fake-link/");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
