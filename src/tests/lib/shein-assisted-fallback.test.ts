import { describe, expect, it } from "vitest";
import {
  SHEIN_ASSISTED_SOURCE,
  buildSheinAssistedPayload,
  validateSheinAssistedConfirmation,
} from "@/lib/publish/shein-assisted-fallback";

describe("Shein assisted fallback", () => {
  const valid = {
    originalUrl: "https://onelink.shein.com/46/ambiguous",
    title: "Camiseta confirmada pelo usuário",
    price: "39,90",
    imageUrl: "https://img.ltwebstatic.com/product.jpg",
  };

  it("accepts the original URL and returns exact confirmed values", () => {
    const result = validateSheinAssistedConfirmation(valid);

    expect(result).toEqual({
      ok: true,
      confirmation: {
        title: valid.title,
        price: 39.9,
        imageUrl: valid.imageUrl,
      },
    });
  });

  it("rejects missing price", () => {
    expect(validateSheinAssistedConfirmation({ ...valid, price: "" })).toMatchObject({
      ok: false,
      errors: ["PREÇO_OBRIGATÓRIO"],
    });
  });

  it("rejects missing title", () => {
    expect(validateSheinAssistedConfirmation({ ...valid, title: "   " })).toMatchObject({
      ok: false,
      errors: ["TÍTULO_OBRIGATÓRIO"],
    });
  });

  it("rejects an invalid image URL", () => {
    expect(validateSheinAssistedConfirmation({ ...valid, imageUrl: "imagem local" })).toMatchObject({
      ok: false,
      errors: ["IMAGEM_URL_INVÁLIDA"],
    });
  });

  it("builds a manual-source payload without allowing IA or title lookup to set price", () => {
    const result = validateSheinAssistedConfirmation(valid);
    if (!result.ok) throw new Error("fixture should be valid");

    expect(buildSheinAssistedPayload(valid.originalUrl, result.confirmation)).toEqual({
      originalUrl: valid.originalUrl,
      manual_source: true,
      source: SHEIN_ASSISTED_SOURCE,
      title: valid.title,
      price: 39.9,
      imageUrl: valid.imageUrl,
    });
  });
});
