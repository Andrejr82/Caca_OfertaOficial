import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, createSupabaseAdminClient, getUser, serverFrom, adminFrom } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getUser: vi.fn(),
  serverFrom: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { GET, POST } from "@/app/api/reels/generate/route";
import { isAutoReelTerminal, autoReelStatusLabel } from "@/lib/videos/auto-reel";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const offer = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: user.id,
  product_name: "Tênis demonstrativo",
  current_price: 129.9,
  platform: "Shopee",
  image_url: "https://cdn.example.com/tenis.jpg",
};

function chain(result: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "insert"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.single = vi.fn().mockResolvedValue(result);
  return builder;
}

function request(body: unknown) {
  return new Request("http://localhost/api/reels/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reels/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminFrom.mockReset();
    getUser.mockResolvedValue({ data: { user } });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser }, from: serverFrom });
    createSupabaseAdminClient.mockReturnValue({ from: adminFrom });
    serverFrom.mockReturnValue(chain({ data: offer, error: null }));
    adminFrom.mockImplementationOnce(() => chain({ data: null, error: null }));
    adminFrom.mockImplementationOnce(() => chain({ data: { id: "job-1" }, error: null }));
  });

  it("exige autenticação", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const response = await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(response.status).toBe(401);
    expect(serverFrom).not.toHaveBeenCalled();
  });

  it("cria Auto Reel para oferta válida", async () => {
    const response = await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(response.status).toBe(201);
    expect(adminFrom).toHaveBeenCalledWith("video_jobs");
    expect(adminFrom.mock.results[1]?.value.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: "processing",
      stage: "planning",
    }));
  });

  it("rejeita oferta inexistente", async () => {
    serverFrom.mockReturnValueOnce(chain({ data: null, error: null }));
    const response = await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(response.status).toBe(404);
  });

  it("rejeita oferta cross-user", async () => {
    serverFrom.mockReturnValueOnce(chain({ data: null, error: null }));
    const response = await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(response.status).toBe(404);
  });

  it("usa título, preço e imagem vindos do banco", async () => {
    await POST(request({ offerId: offer.id, style: "demonstrative-reel", title: "adulterado", currentPrice: 1, imageUrl: "fake" }));
    const insert = adminFrom.mock.results[1]?.value.insert;
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: user.id,
      offer_id: offer.id,
      metadata: expect.objectContaining({
        factualSnapshot: {
          offerId: offer.id,
          productName: offer.product_name,
          currentPrice: offer.current_price,
          platform: offer.platform,
          imageUrl: offer.image_url,
        },
      }),
    }));
  });

  it("não aceita fatos comerciais do payload malicioso", async () => {
    await POST(request({
      offerId: offer.id,
      style: "demonstrative-reel",
      userId: "attacker",
      productName: "Oferta falsa",
      currentPrice: 0.01,
      imageUrl: "https://attacker.invalid/image.jpg",
      marketplace: "Outro",
    }));
    const insert = adminFrom.mock.results[1]?.value.insert;
    expect(insert.mock.calls[0][0].metadata.factualSnapshot).toEqual({
      offerId: offer.id,
      productName: offer.product_name,
      currentPrice: offer.current_price,
      platform: offer.platform,
      imageUrl: offer.image_url,
    });
  });

  it("persiste template auto-reel-v1", async () => {
    await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(adminFrom.mock.results[1]?.value.insert).toHaveBeenCalledWith(expect.objectContaining({ template_id: "auto-reel-v1" }));
  });

  it("persiste source auto-generated-reel", async () => {
    await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(adminFrom.mock.results[1]?.value.insert).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ source: "auto-generated-reel" }),
    }));
  });

  it("persiste attempt inicial 1", async () => {
    await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(adminFrom.mock.results[1]?.value.insert).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ attempt: 1 }),
    }));
  });

  it("persiste style demonstrative-reel", async () => {
    await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(adminFrom.mock.results[1]?.value.insert).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ style: "demonstrative-reel" }),
    }));
  });

  it("associa o job ao usuário autenticado", async () => {
    await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(adminFrom.mock.results[1]?.value.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: user.id }));
  });

  it("reutiliza job ativo em request repetido", async () => {
    const existing = { data: { id: "existing-job", status: "queued" }, error: null };
    adminFrom.mockReset();
    adminFrom.mockImplementationOnce(() => chain(existing));
    const response = await POST(request({ offerId: offer.id, style: "demonstrative-reel" }));
    expect(response.status).toBe(200);
    expect(adminFrom).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/reels/generate e estado da UI", () => {
  it("retorna somente job do usuário autenticado para polling", async () => {
    const jobBuilder = chain({ data: { id: "job-1", status: "queued", stage: "queued" }, error: null });
    getUser.mockResolvedValue({ data: { user } });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser }, from: vi.fn(() => jobBuilder) });
    const response = await GET(new Request("http://localhost/api/reels/generate?jobId=job-1"));
    expect(response.status).toBe(200);
    expect(jobBuilder.eq).toHaveBeenCalledWith("user_id", user.id);
  });

  it("mapeia os estados do contrato para a UI", () => {
    expect(autoReelStatusLabel("queued")).toBe("Na fila");
    expect(autoReelStatusLabel("planning")).toBe("Planejando");
    expect(autoReelStatusLabel("generating_visual")).toBe("Gerando visual");
    expect(autoReelStatusLabel("analyzing")).toBe("Analisando");
    expect(autoReelStatusLabel("dubbing")).toBe("Dublando");
    expect(autoReelStatusLabel("rendering")).toBe("Renderizando");
    expect(autoReelStatusLabel("ready_for_review")).toBe("Pronto para revisão");
  });

  it("encerra polling em estados terminais", () => {
    expect(isAutoReelTerminal("ready_for_review")).toBe(true);
    expect(isAutoReelTerminal("approved")).toBe(true);
    expect(isAutoReelTerminal("rejected")).toBe(true);
    expect(isAutoReelTerminal("failed")).toBe(true);
    expect(isAutoReelTerminal("queued")).toBe(false);
  });

  it("mantém o fluxo authorized-reel disponível", async () => {
    await expect(import("@/lib/videos/authorized-reel")).resolves.toBeDefined();
  });
});
