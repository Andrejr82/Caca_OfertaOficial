import { generateOfficialAI, type OfficialAICommand } from "@/core/ai";
import { publishOfficialPost, type OfficialPublicationCommand } from "@/core/publication";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createOfficialPublicationServiceDependencies } from "@/lib/publication/official/create-official-publication-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inngest } from "./client";
import { TELEGRAM_CYCLE_INTROS } from "@/config/cycle-intros";
import { sendTelegramMessage } from "@/lib/telegram/client";

const PARALLEL_COMPONENT_DISABLED = "PARALLEL_COMPONENT_DISABLED: submit a command to an official service";

function adminClient() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("Official service dependencies are unavailable");
  return client;
}

function disabledJob(): never {
  throw new Error(PARALLEL_COMPONENT_DISABLED);
}

export const publishPostBackground = inngest.createFunction(
  { id: "publish-post", retries: 3, triggers: [{ event: "post/publish" }] },
  async ({ event, step }: any) => {
    const command = event.data?.command as OfficialPublicationCommand;
    return step.run("publish-official-post", () => publishOfficialPost(
      command,
      createOfficialPublicationServiceDependencies(adminClient(), command?.tenantId)
    ));
  }
);

export const processOfferBackground = inngest.createFunction(
  { id: "process-offer", retries: 2, triggers: [{ event: "offer/process" }] },
  async ({ event, step }: any) => {
    const command = event.data?.command as OfficialAICommand;
    return step.run("generate-official-ai", () => generateOfficialAI(
      command,
      createOfficialAIServiceDependencies(adminClient(), command?.tenantId)
    ));
  }
);

export const syncAnalyticsBackground = inngest.createFunction(
  { id: "sync-analytics", triggers: [{ event: "analytics/sync" }] },
  disabledJob
);

export const runUserScrapingBackground = inngest.createFunction(
  { id: "run-user-scraping", retries: 0, triggers: [{ event: "cron/run-scraping" }] },
  disabledJob
);

export const instagramPollingBackground = inngest.createFunction(
  { id: "instagram-polling", retries: 0, triggers: [{ cron: "*/5 * * * *" }] },
  disabledJob
);

export const sendTelegramCycleIntro = inngest.createFunction(
  { 
    id: "send-telegram-cycle-intro", 
    triggers: [{ cron: "0 6-21 * * *", tz: "America/Sao_Paulo" }] 
  },
  async ({ step }: any) => {
    return step.run("send-intro-message", async () => {
      const currentHour = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
      const message = TELEGRAM_CYCLE_INTROS[Number(currentHour)];
      if (message) {
        await sendTelegramMessage(message);
        return { success: true, hour: currentHour };
      }
      return { success: false, reason: "No message configured for this hour", hour: currentHour };
    });
  }
);

export * from "./tracking";
