import { describe, expect, it } from "vitest";

import { buildTwoSceneReelsPlan } from "@/lib/videos/reels-playbook";

describe("buildTwoSceneReelsPlan", () => {
  it("gera duas cenas de 10s para a Sanduicheira Mondial real do ciclo Casa/Cozinha", () => {
    const plan = buildTwoSceneReelsPlan({
      id: "912a4f7f-acbd-4da8-bd21-5ac5a6ee3774",
      product_name: "MONDIAL Sanduicheira Master Grill Inox, 110V, Preto, 750W - S-20",
      platform: "Amazon",
      current_price: 89.30,
      old_price: 149.90,
      image_url: "https://example.com/sanduicheira.jpg",
      category: "Casa e Cozinha — Amazon Brasil",
    });

    expect(plan.niche).toBe("Casa/Cozinha/Organização");
    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes[0].durationSeconds).toBe(10);
    expect(plan.scenes[1].durationSeconds).toBe(10);
    expect(plan.scenes[1].avatarSpeech).toContain("R$ 149,90");
    expect(plan.scenes[1].avatarSpeech).toContain("R$ 89,30");
    expect(plan.scenes[1].overlayText).toContain("40% OFF");
    expect(plan.scenes[0].prompt).toContain("Mesmo avatar hiper-realista");
    expect(plan.scenes[1].prompt).toContain("Continuação direta da Cena 1");
    expect(plan.referenceImageUrl).toBe("https://example.com/sanduicheira.jpg");
  });

  it("não inventa desconto quando não existe preço anterior válido", () => {
    const plan = buildTwoSceneReelsPlan({
      id: "offer-2",
      product_name: "Mixer portátil",
      platform: "Amazon",
      current_price: 34.90,
      old_price: null,
      image_url: "https://example.com/mixer.jpg",
      category: "Casa e Cozinha",
    });

    expect(plan.scenes[1].overlayText).toBe("R$ 34,90");
    expect(plan.scenes[1].avatarSpeech).not.toContain("caiu de");
    expect(plan.scenes[1].prompt).toContain("Não inventar funções");
  });
});
