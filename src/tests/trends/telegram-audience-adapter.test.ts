import { describe, expect, it, vi } from "vitest";
import { fetchTelegramAudienceSnapshot } from "@/lib/trends/telegram-audience-adapter";

describe("Telegram audience adapter", () => {
  it("coleta member_count e produz snapshot sem atribuição a produto", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: 4321 }),
    });

    const snapshot = await fetchTelegramAudienceSnapshot({
      botToken: "secret-token",
      chatId: "@cacaofertas",
      observedAt: "2026-08-10T23:00:00.000Z",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("getChatMemberCount");
    expect(String(fetchImpl.mock.calls[0][0])).toContain("chat_id=%40cacaofertas");
    expect(snapshot).toMatchObject({
      channel: "telegram",
      metric: "member_count",
      value: 4321,
      productAttribution: null,
      causalAttribution: false,
    });
  });

  it("falha fechado quando a API não comprova uma contagem válida", async () => {
    await expect(fetchTelegramAudienceSnapshot({
      botToken: "secret-token",
      chatId: "@cacaofertas",
      fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false, result: null }) }) as Response,
    })).rejects.toThrow(/telegram/i);
  });
});
