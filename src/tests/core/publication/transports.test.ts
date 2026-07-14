import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PublicationTransportRequest } from "@/core/publication";
import { TelegramPublicationTransport } from "@/core/publication/transports/telegram-transport";
import { WhatsAppPublicationTransport } from "@/core/publication/transports/whatsapp-transport";
import { InstagramPublicationTransport } from "@/core/publication/transports/instagram-transport";
import { FacebookPublicationTransport } from "@/core/publication/transports/facebook-transport";

const request = (channel: PublicationTransportRequest["channel"]): PublicationTransportRequest => ({
  commandId: "command-1",
  idempotencyKey: `publication:post-1:${channel}`,
  correlationId: "correlation-1",
  causationId: "ai-command-1",
  tenantId: "tenant-1",
  offerId: "offer-1",
  postId: "post-1",
  channel,
  content: "Conteúdo oficial persistido",
  mediaUrl: "https://images.example/offer.jpg",
  destination: `${channel}-destination`,
  timeoutMs: 30_000,
  metadata: { requestSource: "dashboard" }
});

const receiptDependencies = {
  clock: { now: () => "2026-07-14T12:00:00.000Z" },
  uuid: { generate: () => "receipt-1" },
  evidenceHash: (value: string) => `sha256:${value.length}`
};

describe("official publication transports", () => {
  it("Telegram delegates one technical send and returns a final receipt", async () => {
    const send = vi.fn().mockResolvedValue({ externalId: "tg-100", sentAt: "2026-07-14T11:59:59.000Z" });
    const transport = new TelegramPublicationTransport({ send, ...receiptDependencies });
    const result = await transport.publish(request("telegram"));
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ text: "Conteúdo oficial persistido", requestId: "command-1" }));
    expect(result).toMatchObject({ receiptVersion: "pmav5.receipt/v1", channel: "telegram", provider: "telegram-bot-api", externalId: "tg-100", accepted: true, outcome: "confirmed" });
  });

  it("WhatsApp delegates one technical send without business retry", async () => {
    const send = vi.fn().mockResolvedValue({ externalId: "wa-100", sentAt: "2026-07-14T11:59:59.000Z" });
    const transport = new WhatsAppPublicationTransport({ send, ...receiptDependencies });
    const result = await transport.publish(request("whatsapp"));
    expect(send).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ channel: "whatsapp", provider: "whatsapp-engine", externalId: "wa-100", deliveryStatus: "confirmed" });
  });

  it("Instagram accepts only a final synchronous provider result", async () => {
    const send = vi.fn().mockResolvedValue({ externalId: "ig-100", sentAt: "2026-07-14T11:59:59.000Z", final: true });
    const transport = new InstagramPublicationTransport({ send, ...receiptDependencies });
    await expect(transport.publish(request("instagram"))).resolves.toMatchObject({ channel: "instagram", provider: "meta-instagram-graph", externalId: "ig-100", outcome: "confirmed" });
  });

  it("Instagram fails closed when the provider only creates an asynchronous job", async () => {
    const send = vi.fn().mockResolvedValue({ externalId: "job-100", sentAt: "2026-07-14T11:59:59.000Z", final: false });
    const transport = new InstagramPublicationTransport({ send, ...receiptDependencies });
    await expect(transport.publish(request("instagram"))).rejects.toThrow(/final receipt/i);
  });

  it("Facebook delegates one technical send and returns a final receipt", async () => {
    const send = vi.fn().mockResolvedValue({ externalId: "fb-100", sentAt: "2026-07-14T11:59:59.000Z" });
    const transport = new FacebookPublicationTransport({ send, ...receiptDependencies });
    await expect(transport.publish(request("facebook"))).resolves.toMatchObject({ channel: "facebook", provider: "meta-facebook-graph", externalId: "fb-100", outcome: "confirmed" });
  });

  it.each(["telegram", "whatsapp", "instagram", "facebook"])("%s rejects a request for another channel", async (name) => {
    const send = vi.fn().mockResolvedValue({ externalId: "external-1", sentAt: "2026-07-14T11:59:59.000Z", final: true });
    const constructors = {
      telegram: TelegramPublicationTransport,
      whatsapp: WhatsAppPublicationTransport,
      instagram: InstagramPublicationTransport,
      facebook: FacebookPublicationTransport
    } as const;
    const transport = new constructors[name as keyof typeof constructors]({ send, ...receiptDependencies });
    const other = name === "telegram" ? "whatsapp" : "telegram";
    await expect(transport.publish(request(other))).rejects.toThrow(/channel/i);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["telegram", "whatsapp", "instagram", "facebook"])("%s transport source has no forbidden authority imports", (name) => {
    const source = readFileSync(resolve(process.cwd(), `src/core/publication/transports/${name}-transport.ts`), "utf8");
    expect(source).not.toMatch(/supabase|official-state-service|transitionOfficial|@\/core\/ai|posts?\.insert|offers?\.update/i);
  });
});
