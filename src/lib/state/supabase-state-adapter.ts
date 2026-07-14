import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditPort,
  AuditRecord,
  IdempotencyPort,
  StateEntity,
  StateRepositoryPort,
  StateTransitionResult
} from "@/core/state";
import type { CompareAndSetInput } from "@/core/state/types";
import type { IdempotencyBeginResult } from "@/core/state/ports/idempotency-port";
import { offerStateVersion, postStateVersion } from "./official-state-service";
import { createServerObservabilityDependencies, StateObservabilityAuditAdapter } from "@/lib/observability";

interface PendingTransition {
  fingerprint: string;
  result: Promise<StateTransitionResult>;
  resolve(result: StateTransitionResult): void;
}

interface StoredIdempotencyValue {
  fingerprint: string;
  status: "pending" | "completed";
  result?: StateTransitionResult;
}

const IDEMPOTENCY_PREFIX = "pmav5.state.idempotency.";
const CROSS_RUNTIME_POLL_ATTEMPTS = 50;
const CROSS_RUNTIME_POLL_INTERVAL_MS = 100;

function idempotencySettingKey(idempotencyKey: string): string {
  return `${IDEMPOTENCY_PREFIX}${idempotencyKey}`;
}

function tableFor(entityType: CompareAndSetInput["entityType"]): "offers" | "posts" {
  return entityType === "offer" ? "offers" : "posts";
}

function stateVersion(entityType: CompareAndSetInput["entityType"], state: StateEntity["state"]): number {
  return entityType === "offer"
    ? offerStateVersion(state as Parameters<typeof offerStateVersion>[0])
    : postStateVersion(state as Parameters<typeof postStateVersion>[0]);
}

function toStateEntity(
  entityType: CompareAndSetInput["entityType"],
  row: { id: string; user_id: string; status: StateEntity["state"] }
): StateEntity {
  return {
    entityType,
    entityId: row.id,
    tenantId: row.user_id,
    state: row.status,
    version: stateVersion(entityType, row.status)
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class SupabaseStateAdapter implements StateRepositoryPort, AuditPort, IdempotencyPort {
  private readonly pending = new Map<string, PendingTransition>();

  constructor(
    private readonly client: SupabaseClient,
    private readonly tenantId: string
  ) {}

  async findById(
    entityType: CompareAndSetInput["entityType"],
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null> {
    if (tenantId !== this.tenantId) return null;
    const { data, error } = await this.client
      .from(tableFor(entityType))
      .select("id,user_id,status")
      .eq("id", entityId)
      .eq("user_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(`State repository read failed: ${error.message}`);
    return data ? toStateEntity(entityType, data as never) : null;
  }

  async compareAndSet(input: CompareAndSetInput) {
    if (
      input.tenantId !== this.tenantId ||
      input.expectedVersion !== stateVersion(input.entityType, input.expectedState)
    ) {
      return { status: "conflict" as const, entity: await this.findById(input.entityType, input.entityId, input.tenantId) };
    }

    const payload = input.entityType === "offer"
      ? { status: input.newState, updated_at: new Date().toISOString() }
      : { status: input.newState };
    const { data, error } = await this.client
      .from(tableFor(input.entityType))
      .update(payload)
      .eq("id", input.entityId)
      .eq("user_id", input.tenantId)
      .eq("status", input.expectedState)
      .select("id,user_id,status")
      .maybeSingle();
    if (error) throw new Error(`State repository CAS failed: ${error.message}`);
    if (!data) {
      return {
        status: "conflict" as const,
        entity: await this.findById(input.entityType, input.entityId, input.tenantId)
      };
    }
    return {
      status: "applied" as const,
      entity: {
        ...toStateEntity(input.entityType, data as never),
        version: input.expectedVersion + 1
      }
    };
  }

  async register(record: AuditRecord): Promise<void> {
    const { error } = await this.client.from("integration_logs").insert({
      user_id: this.tenantId,
      integration: "official-state-service",
      action: "state_transition",
      status: record.result === "applied" ? "success" : record.result === "rejected" ? "error" : "skipped",
      message: `${record.entity}:${record.previousState ?? "unknown"}->${record.newState}`,
      metadata: record
    });
    if (error) throw new Error(`State audit write failed: ${error.message}`);
  }

  async begin(idempotencyKey: string, fingerprint: string): Promise<IdempotencyBeginResult> {
    const settingKey = idempotencySettingKey(idempotencyKey);
    const local = this.pending.get(settingKey);
    if (local) {
      return local.fingerprint === fingerprint
        ? { status: "pending", result: local.result }
        : { status: "conflict" };
    }

    const value: StoredIdempotencyValue = { fingerprint, status: "pending" };
    const { error } = await this.client.from("app_settings").insert({
      user_id: this.tenantId,
      key: settingKey,
      value
    });

    if (!error) {
      let resolve!: (result: StateTransitionResult) => void;
      const result = new Promise<StateTransitionResult>((complete) => {
        resolve = complete;
      });
      this.pending.set(settingKey, { fingerprint, result, resolve });
      return { status: "started" };
    }
    if (error.code !== "23505") {
      throw new Error(`State idempotency reservation failed: ${error.message}`);
    }

    const stored = await this.readIdempotency(settingKey);
    if (stored.fingerprint !== fingerprint) return { status: "conflict" };
    if (stored.status === "completed" && stored.result) {
      return { status: "replay", result: stored.result };
    }
    return { status: "pending", result: this.waitForCompleted(settingKey, fingerprint) };
  }

  async complete(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void> {
    const settingKey = idempotencySettingKey(idempotencyKey);
    const { error } = await this.client
      .from("app_settings")
      .update({ value: { fingerprint, status: "completed", result } satisfies StoredIdempotencyValue })
      .eq("user_id", this.tenantId)
      .eq("key", settingKey);
    if (error) throw new Error(`State idempotency completion failed: ${error.message}`);

    this.pending.get(settingKey)?.resolve(result);
    this.pending.delete(settingKey);
  }

  private async readIdempotency(settingKey: string): Promise<StoredIdempotencyValue> {
    const { data, error } = await this.client
      .from("app_settings")
      .select("value")
      .eq("user_id", this.tenantId)
      .eq("key", settingKey)
      .single();
    if (error || !data) {
      throw new Error(`State idempotency read failed: ${error?.message ?? "record not found"}`);
    }
    return data.value as unknown as StoredIdempotencyValue;
  }

  private async waitForCompleted(
    settingKey: string,
    fingerprint: string
  ): Promise<StateTransitionResult> {
    for (let attempt = 0; attempt < CROSS_RUNTIME_POLL_ATTEMPTS; attempt += 1) {
      await wait(CROSS_RUNTIME_POLL_INTERVAL_MS);
      const stored = await this.readIdempotency(settingKey);
      if (stored.fingerprint !== fingerprint) {
        throw new Error("State idempotency fingerprint changed while pending");
      }
      if (stored.status === "completed" && stored.result) return stored.result;
    }
    throw new Error("State idempotency command remained pending");
  }
}

export function createSupabaseStateDependencies(client: SupabaseClient, tenantId: string) {
  const adapter = new SupabaseStateAdapter(client, tenantId);
  return {
    repository: adapter,
    audit: new StateObservabilityAuditAdapter(adapter, createServerObservabilityDependencies()),
    idempotency: adapter,
    clock: { now: () => new Date().toISOString() },
    uuid: { generate: () => crypto.randomUUID() }
  };
}
