import {
  createOfficialAICyclePages,
  generateOfficialAI,
  processOfficialAICyclePages,
  type OfficialAICommand
} from "@/core/ai";
import { publishOfficialPost, type OfficialPublicationCommand } from "@/core/publication";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createOfficialPublicationServiceDependencies } from "@/lib/publication/official/create-official-publication-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inngest } from "./client";

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

export const processOfferCycleBackground = inngest.createFunction(
  { id: "process-offer-cycle", retries: 4, triggers: [{ event: "offer/cycle.process" }] },
  async ({ event, step }: any) => {
    const { correlationId, tenantId, requestedAt, providerPreference, offerIds } = event.data;
    const pages = createOfficialAICyclePages(correlationId, offerIds);
    const summary = await processOfficialAICyclePages(pages, async (page) => step.run(
      `process-cycle-page-${page.pageNumber}`,
      async () => {
        const command: OfficialAICommand = {
          contractVersion: "pmav5.ai/v1",
          commandId: page.idempotencyKey,
          idempotencyKey: page.idempotencyKey,
          correlationId,
          causationId: `oracle:${correlationId}`,
          offerId: `CYCLE_PAGE_${page.pageNumber}`,
          tenantId,
          providerPreference,
          channels: ["telegram", "instagram", "whatsapp"],
          requestedAt,
          actor: { type: "service", id: "oracle-worker", service: "oracle-worker" },
          origin: "oracle.discovery",
          reason: { code: "GENERATE_OFFICIAL_CONTENT" },
          batch: {
            operation: "PROCESS_OFFERS",
            offerIds: page.offerIds,
            pageNumber: page.pageNumber,
            totalPages: page.totalPages
          }
        };
        const result = await generateOfficialAI(
          command,
          createOfficialAIServiceDependencies(adminClient(), tenantId)
        );
        return {
          status: result.status === "rejected" ? "rejected" as const : "completed" as const,
          pageNumber: page.pageNumber,
          offerIds: page.offerIds,
          result
        };
      }
    ));

    await step.run("complete-official-ai-cycle", async () => {
      const pageMetrics = summary.results
        .map((page) => page.result.status === "drafted" ? page.result.batch : undefined)
        .filter((metrics): metrics is NonNullable<typeof metrics> => Boolean(metrics));
      const { error } = await adminClient().from("integration_logs").insert({
        user_id: tenantId,
        integration: "official-ai-service",
        action: "ai_cycle_completed",
        status: "success",
        message: `${correlationId}:cycle_completed`,
        metadata: {
          correlationId,
          offerIds,
          offerIdsReceived: offerIds.length,
          pagesProcessed: summary.pagesProcessed,
          offersVisited: summary.offersVisited,
          draftedOffers: pageMetrics.reduce((total, metrics) => total + metrics.draftedOffers, 0),
          draftsPersisted: pageMetrics.reduce((total, metrics) => total + metrics.draftsPersisted, 0),
          rejectedOffers: pageMetrics.reduce((total, metrics) => total + metrics.rejectedOffers, 0),
          idempotentReplays: pageMetrics.reduce((total, metrics) => total + metrics.idempotentReplays, 0),
          stalePending: pageMetrics.reduce((total, metrics) => total + metrics.stalePending, 0),
          pageStatuses: summary.results.map((page) => ({ pageNumber: page.pageNumber, status: page.status })),
          batchCompleted: summary.batchCompleted
        }
      });
      if (error) throw new Error(`Official AI cycle completion audit failed: ${error.message}`);
    });
    return summary;
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

export * from "./tracking";
