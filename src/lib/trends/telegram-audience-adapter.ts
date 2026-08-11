import { buildAudienceSnapshot, type AudienceSnapshot } from "@/core/trends/audience-signals";

interface TelegramAudienceOptions {
  botToken: string;
  chatId: string;
  observedAt?: string;
  fetchImpl?: typeof fetch;
}

export async function fetchTelegramAudienceSnapshot(
  options: TelegramAudienceOptions,
): Promise<AudienceSnapshot> {
  const botToken = options.botToken.trim();
  const chatId = options.chatId.trim();
  if (!botToken || !chatId) throw new Error("Configuração Telegram incompleta para audiência.");

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMemberCount`);
  url.searchParams.set("chat_id", chatId);

  const response = await fetchImpl(url, { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao consultar audiência do Telegram.");

  const payload = await response.json() as { ok?: boolean; result?: unknown };
  const memberCount = Number(payload.result);
  if (payload.ok !== true || !Number.isInteger(memberCount) || memberCount < 0) {
    throw new Error("Telegram não retornou uma contagem de membros válida.");
  }

  return buildAudienceSnapshot({
    channel: "telegram",
    metric: "member_count",
    value: memberCount,
    observedAt: options.observedAt ?? new Date().toISOString(),
    source: "telegram_bot_api:getChatMemberCount",
  });
}
