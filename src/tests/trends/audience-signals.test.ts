import { describe, expect, it } from "vitest";
import {
  AUDIENCE_SIGNAL_CAPABILITIES,
  buildAudienceSnapshot,
} from "@/core/trends/audience-signals";

describe("audience signal capability contract", () => {
  it("permite apenas métricas oficialmente suportadas por canal", () => {
    expect(AUDIENCE_SIGNAL_CAPABILITIES.telegram.metrics).toContain("member_count");
    expect(AUDIENCE_SIGNAL_CAPABILITIES.instagram.metrics).toEqual(expect.arrayContaining(["followers_total", "accounts_reached", "views", "interactions"]));
    expect(AUDIENCE_SIGNAL_CAPABILITIES.facebook.metrics).toEqual(expect.arrayContaining(["followers_total", "reach", "engagement"]));
    expect(AUDIENCE_SIGNAL_CAPABILITIES.whatsapp.metrics).toEqual(expect.arrayContaining(["messages_sent", "messages_delivered", "conversations"]));
    expect(AUDIENCE_SIGNAL_CAPABILITIES.whatsapp.metrics).not.toContain("followers_total");
  });

  it("gera snapshot somente para métrica suportada e nunca atribui causalidade a produto", () => {
    const snapshot = buildAudienceSnapshot({
      channel: "telegram",
      metric: "member_count",
      value: 1234,
      observedAt: "2026-08-10T23:00:00.000Z",
      source: "telegram_bot_api",
    });

    expect(snapshot).toMatchObject({
      channel: "telegram",
      metric: "member_count",
      value: 1234,
      source: "telegram_bot_api",
      productAttribution: null,
      causalAttribution: false,
    });
  });

  it("rejeita métrica inexistente ou valor inválido", () => {
    expect(() => buildAudienceSnapshot({
      channel: "whatsapp",
      metric: "followers_total" as never,
      value: 10,
      observedAt: "2026-08-10T23:00:00.000Z",
      source: "meta_api",
    })).toThrow(/não suportada/i);

    expect(() => buildAudienceSnapshot({
      channel: "telegram",
      metric: "member_count",
      value: -1,
      observedAt: "2026-08-10T23:00:00.000Z",
      source: "telegram_bot_api",
    })).toThrow(/valor/i);
  });
});
