import { describe, expect, it } from "vitest";
import {
  assertInstagramV4PublicationAllowed,
  isInstagramReelsDraft,
  isInstagramStoriesV4Handoff,
} from "@/lib/social/meta-publication-guard";

describe("Social Copy V4 — Meta publication guard", () => {
  it("recognizes legacy Stories only for quarantine", () => {
    expect(isInstagramStoriesV4Handoff("STORIES V4 · HANDOFF MANUAL\n\nTELA 1/3")).toBe(true);
    expect(isInstagramStoriesV4Handoff("REELS · AGUARDANDO VÍDEO")).toBe(false);
  });

  it("recognizes new Reel drafts", () => {
    expect(isInstagramReelsDraft("REELS · AGUARDANDO VÍDEO\n\nOferta")).toBe(true);
    expect(isInstagramReelsDraft("Legenda normal de feed")).toBe(false);
  });

  it("blocks legacy static Stories from every publication transport", () => {
    expect(() => assertInstagramV4PublicationAllowed({
      content: "STORIES V4 · HANDOFF MANUAL\n\nTELA 1/3\nOferta",
      mediaType: "FEED",
      reelsEnabled: false,
    })).toThrow(/retired/iu);

    expect(() => assertInstagramV4PublicationAllowed({
      content: "STORIES V4 · HANDOFF MANUAL\n\nTELA 1/3\nOferta",
      mediaType: "REELS",
      reelsEnabled: true,
    })).toThrow(/retired/iu);
  });

  it("blocks Reel drafts from falling through to Feed", () => {
    expect(() => assertInstagramV4PublicationAllowed({
      content: "REELS · AGUARDANDO VÍDEO\n\nOferta",
      mediaType: "FEED",
      reelsEnabled: false,
    })).toThrow(/requires REELS transport/iu);
  });

  it("keeps Reels blocked while audiovisual generation is disabled", () => {
    expect(() => assertInstagramV4PublicationAllowed({
      content: "REELS · AGUARDANDO VÍDEO\n\nOferta",
      mediaType: "REELS",
      reelsEnabled: false,
    })).toThrow(/Reels V4 is disabled/iu);
  });

  it("allows a Reel draft only through REELS with explicit opt-in", () => {
    expect(() => assertInstagramV4PublicationAllowed({
      content: "REELS · AGUARDANDO VÍDEO\n\nOferta",
      mediaType: "REELS",
      reelsEnabled: true,
    })).not.toThrow();
  });
});
