import { describe, expect, it } from "vitest";
import {
  assertInstagramV4PublicationAllowed,
  isInstagramStoriesV4Handoff,
} from "@/lib/social/meta-publication-guard";

describe("Social Copy V4 — Meta publication guard", () => {
  it("reconhece o handoff canônico de Stories V4", () => {
    expect(isInstagramStoriesV4Handoff("STORIES V4 · HANDOFF MANUAL\n\nTELA 1/3")).toBe(true);
    expect(isInstagramStoriesV4Handoff("Legenda normal de feed")).toBe(false);
  });

  it("impede Stories V4 de cair silenciosamente no Feed", () => {
    expect(() => assertInstagramV4PublicationAllowed({
      content: "STORIES V4 · HANDOFF MANUAL\n\nTELA 1/3\nOferta",
      mediaType: "FEED",
      reelsEnabled: false,
    })).toThrow(/manual link-sticker handoff/iu);
  });

  it("impede Stories V4 de cair em Reels mesmo com a flag ligada", () => {
    expect(() => assertInstagramV4PublicationAllowed({
      content: "STORIES V4 · HANDOFF MANUAL\n\nTELA 1/3\nOferta",
      mediaType: "REELS",
      reelsEnabled: true,
    })).toThrow(/manual link-sticker handoff/iu);
  });

  it("mantém Reels bloqueado quando a feature flag está desligada", () => {
    expect(() => assertInstagramV4PublicationAllowed({
      content: "Legenda de Reel aprovado",
      mediaType: "REELS",
      reelsEnabled: false,
    })).toThrow(/Reels V4 is disabled/iu);
  });

  it("permite feed legado normal e Reel somente com opt-in explícito", () => {
    expect(() => assertInstagramV4PublicationAllowed({
      content: "Legenda normal de feed",
      mediaType: "FEED",
      reelsEnabled: false,
    })).not.toThrow();

    expect(() => assertInstagramV4PublicationAllowed({
      content: "Legenda de Reel aprovado",
      mediaType: "REELS",
      reelsEnabled: true,
    })).not.toThrow();
  });
});
