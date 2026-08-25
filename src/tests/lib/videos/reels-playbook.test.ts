import { describe, expect, it } from "vitest";

import { buildTwoSceneReelsPlan } from "@/lib/videos/reels-playbook";

describe("buildTwoSceneReelsPlan", () => {
  it("gera duas cenas de 10s orientadas a uso real para Casa/Cozinha", () => {
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
    expect(plan.scenes[0].prompt).toContain("ação já no primeiro segundo");
    expect(plan.scenes[0].prompt).toContain("não gastar abertura apresentando o produto parado");
    expect(plan.scenes[0].prompt).toContain("REGRA ANTI-APRESENTAÇÃO");
    expect(plan.scenes[0].prompt).toContain("não mostrar avatar segurando o aparelho para a câmera");
    expect(plan.scenes[1].prompt).toContain("CONTINUIDADE OBRIGATÓRIA");
    expect(plan.scenes[1].overlayText).toContain("40% OFF");
    expect(plan.scenes[1].overlayText).toContain("Toque no link");
    expect(plan.scenes[1].avatarSpeech).toContain("R$ 89,30");
    expect(plan.scenes[1].avatarSpeech).toContain("Toque no link");
    expect(plan.referenceImageUrl).toBe("https://example.com/sanduicheira.jpg");
  });

  it("para tênis, começa em uso real e proíbe apresentação estática", () => {
    const plan = buildTwoSceneReelsPlan({
      id: "895734e1-57dd-4a7f-a071-14b53c327bf2",
      product_name: "Tênis Para Corrida Masculino Amortecimento Macio e Super Leve Treino e Caminhada",
      platform: "Amazon",
      current_price: 104.40,
      old_price: 109.90,
      image_url: "https://example.com/tenis.jpg",
      category: "Esporte — Amazon Brasil",
    });

    expect(plan.niche).toBe("Moda");
    expect(plan.scenes[0].prompt).toContain("calçado sendo colocado no pé ou com o primeiro passo em movimento");
    expect(plan.scenes[0].prompt).toContain("não mostrar avatar parado, segurando o calçado para a câmera");
    expect(plan.scenes[0].prompt).toContain("câmera baixa acompanhando os pés");
    expect(plan.scenes[1].prompt).toContain("close lateral do calçado flexionando durante o passo");
    expect(plan.scenes[1].overlayText).toContain("Toque no link");
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

    expect(plan.scenes[1].overlayText).toBe("R$ 34,90 • Toque no link");
    expect(plan.scenes[1].avatarSpeech).not.toContain("% OFF");
    expect(plan.scenes[1].prompt).not.toContain("% OFF");
    expect(plan.scenes[1].prompt).toContain("não inventar cupons, urgência, avaliações, selos");
  });
});
