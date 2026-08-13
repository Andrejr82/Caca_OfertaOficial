import { generateOfficialAI, type OfficialAICommand } from "@/core/ai";
import { approveOfficialOfferForPublication, publishOfficialPost, type OfficialPublicationApprovalCommand, type OfficialPublicationCommand } from "@/core/publication";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createOfficialPublicationApprovalDependencies } from "@/lib/publication/official/create-official-publication-approval";
import { createOfficialPublicationServiceDependencies, publicationIdempotencyKey, publicationPayloadReference } from "@/lib/publication/official/create-official-publication-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildTelegramEditorialPublicationPlan, selectEnabledTelegramAutomationUserIds } from "./telegram-editorial-publication";
import { inngest } from "./client";
import { TELEGRAM_CYCLE_INTROS } from "@/config/cycle-intros";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { loadEditorialTop30TelegramSelection } from "@/lib/telegram/select-editorial-top30-telegram-drafts";

function adminClient() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("Official service dependencies are unavailable");
  return client;
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

export const publishTelegramEditorialTop30 = inngest.createFunction(
  {
    id: "publish-telegram-editorial-top30",
    retries: 0,
    triggers: [{ cron: "*/5 * * * *", tz: "America/Sao_Paulo" }]
  },
  async ({ step }: any) => {
    if (process.env.TELEGRAM_AUTO_PUBLISH !== "1") return { result: "disabled", reason: "TELEGRAM_AUTO_PUBLISH!=1" };
    if (process.env.NO_PUBLISH === "1" || process.env.NO_POSTS === "1") return { result: "disabled", reason: "publication_guard" };
    const client = adminClient();
    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("user_id,value")
      .eq("key", "general_settings");
    if (settingsError) throw settingsError;
    const enabledUserIds = selectEnabledTelegramAutomationUserIds(settings ?? []);
    if (enabledUserIds.length === 0) return { result: "disabled", reason: "telegram_automation_enabled!=true" };
    const results = [];
    const selectedEditorialTop30OfferIds = [];
    let planSize = 0;
    for (const userId of enabledUserIds) {
      const selection = await step.run(`select-editorial-top30:${userId}`, () => loadEditorialTop30TelegramSelection(client, new Date(), userId));
      selectedEditorialTop30OfferIds.push(...selection.offerIds);
      if (selection.offerIds.length === 0) continue;
      const { data: posts, error: postsError } = await client
        .from("posts")
        .select("id,offer_id,user_id,status,created_at")
        .eq("user_id", userId)
        .eq("channel", "telegram")
        .eq("status", "draft")
        .in("offer_id", selection.offerIds)
        .order("created_at", { ascending: true });
      if (postsError) throw postsError;
      const plan = buildTelegramEditorialPublicationPlan(posts ?? [], selection.offerIds);
      planSize += plan.length;
      for (const post of plan) {
        if (post.user_id !== userId) continue;
        const commandId = `telegram-editorial:${post.id}`;
        const requestedAt = new Date().toISOString();
        const approvalCommand: OfficialPublicationApprovalCommand = {
          commandId,
          correlationId: commandId,
          causationId: null,
          tenantId: post.user_id,
          offerId: post.offer_id,
          postId: post.id,
          channel: "telegram",
          requestedAt
        };
        const approval = await approveOfficialOfferForPublication(
          approvalCommand,
          createOfficialPublicationApprovalDependencies(client, post.user_id)
        );
        if (approval.status !== "approved") {
          results.push(approval);
          continue;
        }
        const command: OfficialPublicationCommand = {
          contractVersion: "pmav5.publication/v1",
          commandId,
          idempotencyKey: publicationIdempotencyKey(post.id, "telegram", "editorial-top30"),
          correlationId: commandId,
          causationId: null,
          offerId: post.offer_id,
          postId: post.id,
          tenantId: post.user_id,
          channel: "telegram",
          expectedOfferState: "approved",
          expectedOfferVersion: 2,
          expectedPostState: "draft",
          expectedPostVersion: 0,
          payloadReference: publicationPayloadReference(post.id),
          requestedAt,
          actor: { type: "service", id: "telegram-editorial-scheduler", service: "official-publication-scheduler" },
          origin: "publication.telegram.editorial",
          reason: { code: "EDITORIAL_TOP30_AUTOMATION" },
          metadata: { requestSource: "telegram-editorial-top30" }
        };
        results.push(await publishOfficialPost(command, createOfficialPublicationServiceDependencies(client, post.user_id)));
      }
    }
    return { result: "completed", selectedEditorialTop30OfferIds: [...new Set(selectedEditorialTop30OfferIds)], planSize, results };
  }
);

export * from "./tracking";
