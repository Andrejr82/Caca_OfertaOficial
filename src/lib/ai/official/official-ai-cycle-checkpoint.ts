import type { OfficialAICycleTelemetrySummary, OfficialAIResult } from "@/core/ai";

const CHECKPOINT_PREFIX = "pmav5.ai.cycle.checkpoint.";

export interface OfficialAICycleMetrics {
  pagesProcessed: number;
  offersVisited: number;
  draftedOffers: number;
  draftsPersisted: number;
  rejectedOffers: number;
  idempotentReplays: number;
  stalePending: number;
  observability: OfficialAICycleTelemetrySummary;
}

export interface OfficialAICycleCheckpoint {
  correlationId: string;
  offerIds: string[];
  totalPages: number;
  nextPage: number;
  status: "pending" | "completed";
  metrics: OfficialAICycleMetrics;
  pageStatuses: Array<{ pageNumber: number; status: "completed" | "rejected" }>;
  updatedAt: string;
}

const emptyMetrics = (): OfficialAICycleMetrics => ({
  pagesProcessed: 0, offersVisited: 0, draftedOffers: 0, draftsPersisted: 0,
  rejectedOffers: 0, idempotentReplays: 0, stalePending: 0,
  observability: emptyObservability()
});

const emptyObservability = (): OfficialAICycleTelemetrySummary => ({
  providerModels: {}, fallbacks: 0, invalidProviderOutputByRule: {}, providerFailureByCause: {}
});

function sumCounters(left: Record<string, number>, right: Record<string, number>) {
  return Object.fromEntries([...Object.entries(left), ...Object.entries(right)]
    .reduce((acc, [key, value]) => acc.set(key, (acc.get(key) ?? 0) + value), new Map<string, number>()));
}

function sumObservability(
  left: OfficialAICycleTelemetrySummary | undefined,
  right: OfficialAICycleTelemetrySummary | undefined
): OfficialAICycleTelemetrySummary {
  const before = left ?? emptyObservability();
  const after = right ?? emptyObservability();
  return {
    providerModels: sumCounters(before.providerModels, after.providerModels),
    fallbacks: before.fallbacks + after.fallbacks,
    invalidProviderOutputByRule: sumCounters(before.invalidProviderOutputByRule, after.invalidProviderOutputByRule),
    providerFailureByCause: sumCounters(before.providerFailureByCause, after.providerFailureByCause)
  };
}

function key(correlationId: string) {
  return `${CHECKPOINT_PREFIX}${correlationId}`;
}

async function read(client: any, tenantId: string, correlationId: string) {
  const { data, error } = await client.from("app_settings").select("value")
    .eq("user_id", tenantId).eq("key", key(correlationId)).maybeSingle();
  if (error) throw new Error(`Official AI cycle checkpoint read failed: ${error.message}`);
  return (data?.value ?? null) as OfficialAICycleCheckpoint | null;
}

function assertSameCycle(checkpoint: OfficialAICycleCheckpoint, offerIds: string[], totalPages: number) {
  if (checkpoint.totalPages !== totalPages || JSON.stringify(checkpoint.offerIds) !== JSON.stringify(offerIds)) {
    throw new Error("Official AI cycle checkpoint payload changed for the same correlationId");
  }
}

export async function loadCycleCheckpoint(
  client: any, tenantId: string, correlationId: string, offerIds: string[], totalPages: number
): Promise<OfficialAICycleCheckpoint> {
  const existing = await read(client, tenantId, correlationId);
  if (existing) {
    assertSameCycle(existing, offerIds, totalPages);
    return existing;
  }
  const checkpoint: OfficialAICycleCheckpoint = {
    correlationId, offerIds, totalPages, nextPage: 1, status: "pending",
    metrics: emptyMetrics(), pageStatuses: [], updatedAt: new Date().toISOString()
  };
  const { error } = await client.from("app_settings").insert({
    user_id: tenantId, key: key(correlationId), value: checkpoint
  });
  if (!error) return checkpoint;
  if (error.code !== "23505") throw new Error(`Official AI cycle checkpoint create failed: ${error.message}`);
  const raced = await read(client, tenantId, correlationId);
  if (!raced) throw new Error("Official AI cycle checkpoint disappeared after concurrent creation");
  assertSameCycle(raced, offerIds, totalPages);
  return raced;
}

export async function advanceCycleCheckpoint(
  client: any, tenantId: string, checkpoint: OfficialAICycleCheckpoint, result: OfficialAIResult
): Promise<OfficialAICycleCheckpoint> {
  const pageNumber = checkpoint.nextPage;
  const batch = result.status === "drafted" ? result.batch : undefined;
  const pageStatus = result.status === "rejected" ? "rejected" as const : "completed" as const;
  const completed = pageNumber >= checkpoint.totalPages;
  const next: OfficialAICycleCheckpoint = {
    ...checkpoint,
    nextPage: pageNumber + 1,
    status: completed ? "completed" : "pending",
    metrics: {
      pagesProcessed: checkpoint.metrics.pagesProcessed + 1,
      offersVisited: checkpoint.metrics.offersVisited + (batch?.offersVisited ?? 0),
      draftedOffers: checkpoint.metrics.draftedOffers + (batch?.draftedOffers ?? 0),
      draftsPersisted: checkpoint.metrics.draftsPersisted + (batch?.draftsPersisted ?? 0),
      rejectedOffers: checkpoint.metrics.rejectedOffers + (batch?.rejectedOffers ?? 0),
      idempotentReplays: checkpoint.metrics.idempotentReplays + (batch?.idempotentReplays ?? 0),
      stalePending: checkpoint.metrics.stalePending + (batch?.stalePending ?? 0),
      observability: sumObservability(checkpoint.metrics.observability, batch?.observability)
    },
    pageStatuses: [...checkpoint.pageStatuses, { pageNumber, status: pageStatus }],
    updatedAt: new Date().toISOString()
  };
  const { error } = await client.from("app_settings").update({ value: next })
    .eq("user_id", tenantId).eq("key", key(checkpoint.correlationId));
  if (error) throw new Error(`Official AI cycle checkpoint update failed: ${error.message}`);
  return next;
}
