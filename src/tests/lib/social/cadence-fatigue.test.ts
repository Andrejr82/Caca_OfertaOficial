import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCIAL_CADENCE_POLICY,
  evaluateSocialCadence,
} from "@/lib/social/cadence-fatigue";

const now = "2026-08-20T18:00:00.000Z";

describe("Task 9 — Cadência e Fadiga", () => {
  it("permite oferta nova sem histórico conflitante", () => {
    const result = evaluateSocialCadence({
      offerId: "offer-a",
      channel: "whatsapp",
      clusterKey: "mochila-impermeavel",
      now,
      history: [],
    });

    expect(result).toEqual({
      decision: "ALLOW",
      reasons: [],
      nextEligibleAt: null,
      matchedHistoryCount: 0,
    });
  });

  it("adia a mesma oferta no mesmo canal por 24h, sem blacklist permanente", () => {
    const result = evaluateSocialCadence({
      offerId: "jiesipote",
      channel: "telegram",
      clusterKey: "mochila-impermeavel",
      now,
      history: [
        {
          offerId: "jiesipote",
          channel: "telegram",
          clusterKey: "mochila-impermeavel",
          publishedAt: "2026-08-20T12:00:00.000Z",
        },
      ],
    });

    expect(result.decision).toBe("DEFER");
    expect(result.reasons).toContain("same_offer_same_channel");
    expect(result.nextEligibleAt).toBe("2026-08-21T12:00:00.000Z");
  });

  it("evita canibalização de produtos do mesmo cluster no mesmo canal", () => {
    const result = evaluateSocialCadence({
      offerId: "mochila-b",
      channel: "whatsapp",
      clusterKey: "mochila-impermeavel",
      now,
      history: [
        {
          offerId: "mochila-a",
          channel: "whatsapp",
          clusterKey: "mochila-impermeavel",
          publishedAt: "2026-08-20T14:00:00.000Z",
        },
      ],
    });

    expect(result.decision).toBe("DEFER");
    expect(result.reasons).toContain("same_cluster_same_channel");
    expect(result.nextEligibleAt).toBe("2026-08-20T22:00:00.000Z");
  });

  it("aplica cooldown curto ao mesmo produto entre canais para não competir consigo mesmo", () => {
    const result = evaluateSocialCadence({
      offerId: "jiesipote",
      channel: "telegram",
      clusterKey: "mochila-impermeavel",
      now,
      history: [
        {
          offerId: "jiesipote",
          channel: "whatsapp",
          clusterKey: "mochila-impermeavel",
          publishedAt: "2026-08-20T17:00:00.000Z",
        },
      ],
    });

    expect(result.decision).toBe("DEFER");
    expect(result.reasons).toContain("same_offer_cross_channel");
    expect(result.nextEligibleAt).toBe("2026-08-20T19:00:00.000Z");
  });

  it("limita rajada de posts no mesmo canal sem bloquear outros canais", () => {
    const history = [
      "2026-08-20T16:30:00.000Z",
      "2026-08-20T17:00:00.000Z",
      "2026-08-20T17:30:00.000Z",
    ].map((publishedAt, index) => ({
      offerId: `offer-${index}`,
      channel: "telegram" as const,
      clusterKey: `cluster-${index}`,
      publishedAt,
    }));

    const telegram = evaluateSocialCadence({
      offerId: "offer-new",
      channel: "telegram",
      clusterKey: "cluster-new",
      now,
      history,
    });
    const whatsapp = evaluateSocialCadence({
      offerId: "offer-new",
      channel: "whatsapp",
      clusterKey: "cluster-new",
      now,
      history,
    });

    expect(telegram.decision).toBe("DEFER");
    expect(telegram.reasons).toContain("channel_burst_limit");
    expect(telegram.nextEligibleAt).toBe("2026-08-20T19:30:00.000Z");
    expect(whatsapp.decision).toBe("ALLOW");
  });

  it("usa o maior cooldown quando múltiplas regras coincidem", () => {
    const result = evaluateSocialCadence({
      offerId: "jiesipote",
      channel: "facebook",
      clusterKey: "mochila-impermeavel",
      now,
      history: [
        {
          offerId: "jiesipote",
          channel: "facebook",
          clusterKey: "mochila-impermeavel",
          publishedAt: "2026-08-20T17:00:00.000Z",
        },
        {
          offerId: "outra-mochila",
          channel: "facebook",
          clusterKey: "mochila-impermeavel",
          publishedAt: "2026-08-20T17:30:00.000Z",
        },
      ],
    });

    expect(result.reasons).toContain("same_offer_same_channel");
    expect(result.reasons).toContain("same_cluster_same_channel");
    expect(result.nextEligibleAt).toBe("2026-08-21T17:00:00.000Z");
  });

  it("volta a permitir automaticamente depois que os cooldowns expiram", () => {
    const result = evaluateSocialCadence({
      offerId: "jiesipote",
      channel: "instagram",
      clusterKey: "mochila-impermeavel",
      now,
      history: [
        {
          offerId: "jiesipote",
          channel: "instagram",
          clusterKey: "mochila-impermeavel",
          publishedAt: "2026-08-19T17:59:59.000Z",
        },
      ],
    });

    expect(result.decision).toBe("ALLOW");
  });

  it("falha fechado para timestamps e políticas inválidas", () => {
    expect(() => evaluateSocialCadence({
      offerId: "x",
      channel: "whatsapp",
      clusterKey: "x",
      now: "data-invalida",
      history: [],
    })).toThrow(/valid now/iu);

    expect(() => evaluateSocialCadence({
      offerId: "x",
      channel: "whatsapp",
      clusterKey: "x",
      now,
      history: [],
    }, {
      ...DEFAULT_SOCIAL_CADENCE_POLICY,
      maxPostsPerChannelWindow: 0,
    })).toThrow(/positive integer/iu);
  });
});
