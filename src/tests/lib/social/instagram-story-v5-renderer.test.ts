import { describe, expect, it } from "vitest";
import { buildStoryV5Plan } from "@/lib/social/instagram-story-v5";
import {
  buildStoryV5FrameModel,
  type StoryV5FrameModel,
  type StoryV5VisualFacts,
} from "@/lib/social/instagram-story-v5-renderer";

const visual: StoryV5VisualFacts = {
  marketplace: "Shopee",
  imageUrl: "https://images.example.com/produto.jpg",
};

function requireFrame(frame: StoryV5FrameModel | null): StoryV5FrameModel {
  expect(frame).not.toBeNull();
  if (!frame) throw new Error("Story V5 frame esperado não foi gerado.");
  return frame;
}

describe("Instagram Story Engine V5 renderer", () => {
  it("makes the first DISCOUNT_HERO frame self-sufficient", () => {
    const plan = buildStoryV5Plan({
      productName: "Mochila impermeável expansível",
      marketplace: "Mercado Livre",
      category: "Mochilas",
      currentPrice: 79.9,
      originalPrice: 269,
      freeShipping: false,
      evidence: {},
    });

    const frame = requireFrame(buildStoryV5FrameModel(plan, visual, 1));

    expect(frame.variant).toBe("discount");
    expect(frame.imageUrl).toBe(visual.imageUrl);
    expect(frame.hero).toBe("70% OFF");
    expect(frame.price).toContain("79,90");
    expect(frame.originalPrice).toContain("269,00");
    expect(frame.cta).toBe("VER OFERTA 👇");
  });

  it("does not create a second PRICE_HERO frame when the plan has only one frame", () => {
    const plan = buildStoryV5Plan({
      productName: "Mesa de jantar 4 lugares",
      marketplace: "Shopee",
      category: "Casa",
      currentPrice: 231.54,
      originalPrice: null,
      freeShipping: false,
      evidence: {},
    });

    expect(plan.frameCount).toBe(1);
    expect(buildStoryV5FrameModel(plan, visual, 2)).toBeNull();
  });

  it("uses factual proof as the visual hero for PROOF_HERO", () => {
    const plan = buildStoryV5Plan({
      productName: "Fone Bluetooth",
      marketplace: "Shopee",
      category: "Eletrônicos",
      currentPrice: 129.9,
      originalPrice: null,
      freeShipping: false,
      evidence: { rating: 4.9 },
    });

    const frame = requireFrame(buildStoryV5FrameModel(plan, visual, 1));

    expect(frame.variant).toBe("proof");
    expect(frame.hero).toBe("4,9 ★");
    expect(frame.price).toContain("129,90");
  });

  it("uses frame 2 only as a verified reinforcement", () => {
    const plan = buildStoryV5Plan({
      productName: "Fone Bluetooth",
      marketplace: "Shopee",
      category: "Eletrônicos",
      currentPrice: 129.9,
      originalPrice: null,
      freeShipping: true,
      evidence: { rating: 4.9 },
    });

    expect(plan.frameCount).toBe(3);
    const frame = requireFrame(buildStoryV5FrameModel(plan, visual, 2));

    expect(frame.variant).toBe("reinforcement");
    expect(["4,9 ★", "FRETE GRÁTIS"]).toContain(frame.hero);
  });

  it("never prints implementation instructions or a fake sticker area", () => {
    const plan = buildStoryV5Plan({
      productName: "Produto",
      marketplace: "Shopee",
      category: null,
      currentPrice: 99.9,
      originalPrice: null,
      freeShipping: false,
      evidence: {},
    });

    const frame = buildStoryV5FrameModel(plan, visual, 1);
    const text = JSON.stringify(frame).toLocaleLowerCase("pt-BR");

    expect(text).not.toContain("área livre");
    expect(text).not.toContain("sticker");
    expect(text).not.toContain("handoff");
    expect(text).not.toContain("preço atual informado");
  });
});
