import { describe, expect, it, vi } from "vitest";
import { SupabaseOfficialPublicationAdapter } from "@/lib/publication/official/supabase-official-publication-adapter";

function chain(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe("Facebook Copy V4 — primeiro comentário", () => {
  it("leva o tracked URL persistido ao transporte como affiliateLink sem recolocá-lo no corpo", async () => {
    const trackedUrl = "https://caca-oferta-oficial.vercel.app/go/fb_jiesipote";
    const postBuilder = chain({
      data: {
        id: "post-facebook",
        user_id: "tenant-1",
        offer_id: "offer-1",
        channel: "facebook",
        status: "draft",
        content: "🏆 Top #14\n\n👉 Conferir o preço atual no primeiro comentário. 👇",
        offers: {
          id: "offer-1",
          image_url: "https://images.example/offer.jpg",
          product_name: "Mochila Jiesipote",
          notes: null,
          platform: "Mercado Livre",
          coupon: null,
          original_url: "https://www.mercadolivre.com.br/item",
        },
        affiliate_links: { tracked_url: trackedUrl },
      },
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(postBuilder) };
    const adapter = new SupabaseOfficialPublicationAdapter(client as never, "tenant-1", {
      telegram: "@ofertas",
      whatsapp: "group@g.us",
      instagram: "instagram-account",
      facebook: "facebook-page",
    });

    const post = await adapter.findPost("post-facebook", "tenant-1");

    expect(post?.content).not.toContain(trackedUrl);
    expect(post?.metadata).toEqual({ affiliateLink: trackedUrl });
  });

  it("falha seguro sem inventar affiliateLink quando a relação não possui HTTPS válido", async () => {
    const postBuilder = chain({
      data: {
        id: "post-facebook",
        user_id: "tenant-1",
        offer_id: "offer-1",
        channel: "facebook",
        status: "draft",
        content: "👉 Conferir o preço atual no primeiro comentário. 👇",
        offers: { id: "offer-1", image_url: null, product_name: "Produto", notes: null },
        affiliate_links: { tracked_url: "http://inseguro.example/x" },
      },
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(postBuilder) };
    const adapter = new SupabaseOfficialPublicationAdapter(client as never, "tenant-1", {
      telegram: "@ofertas",
      whatsapp: "group@g.us",
      instagram: "instagram-account",
      facebook: "facebook-page",
    });

    await expect(adapter.findPost("post-facebook", "tenant-1")).resolves.toMatchObject({ metadata: {} });
  });
});