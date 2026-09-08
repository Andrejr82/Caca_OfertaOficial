import { TELEGRAM_CYCLE_INTROS } from "@/config/cycle-intros";
import { sendTelegramMessage } from "@/lib/telegram/client";

export async function executeTelegramCycleIntro() {
  const currentHour = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
  const message = TELEGRAM_CYCLE_INTROS[Number(currentHour)];
  if (message) {
    await sendTelegramMessage(message);
    return { success: true, hour: currentHour };
  }
  return { success: false, reason: "No message configured for this hour", hour: currentHour };
}
