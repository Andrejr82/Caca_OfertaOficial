import { describe, expect, it, vi } from "vitest";
import { SupabaseStateAdapter } from "@/lib/state/supabase-state-adapter";

function chain(result: unknown) {
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result)
  };
  builder.select.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe("SupabaseStateAdapter", () => {
  it("performs offer compare-and-set using tenant and expected state", async () => {
    const builder = chain({ data: { id: "offer-1", user_id: "tenant-1", status: "selected" }, error: null });
    const client = { from: vi.fn(() => builder) };
    const adapter = new SupabaseStateAdapter(client as never, "tenant-1");

    const result = await adapter.compareAndSet({
      entityType: "offer",
      entityId: "offer-1",
      tenantId: "tenant-1",
      expectedState: "pending_manual_review",
      expectedVersion: 0,
      newState: "selected"
    });

    expect(client.from).toHaveBeenCalledWith("offers");
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "selected" }));
    expect(builder.eq).toHaveBeenCalledWith("user_id", "tenant-1");
    expect(builder.eq).toHaveBeenCalledWith("status", "pending_manual_review");
    expect(result).toMatchObject({ status: "applied", entity: { state: "selected", version: 1 } });
  });

  it("increments the CAS version exactly once when rejecting from pending", async () => {
    const builder = chain({ data: { id: "offer-2", user_id: "tenant-1", status: "rejected" }, error: null });
    const client = { from: vi.fn(() => builder) };
    const adapter = new SupabaseStateAdapter(client as never, "tenant-1");

    const result = await adapter.compareAndSet({
      entityType: "offer",
      entityId: "offer-2",
      tenantId: "tenant-1",
      expectedState: "pending_manual_review",
      expectedVersion: 0,
      newState: "rejected"
    });

    expect(result).toMatchObject({ status: "applied", entity: { state: "rejected", version: 1 } });
  });

  it("writes every audit event through integration_logs", async () => {
    const builder = chain({ data: null, error: null });
    const client = { from: vi.fn(() => builder) };
    const adapter = new SupabaseStateAdapter(client as never, "tenant-1");

    await adapter.register({
      auditId: "audit-1",
      timestamp: "2026-07-14T01:00:00.000Z",
      actor: { type: "user", id: "user-1", service: "nextjs-curation" },
      origin: "offers.action.select",
      reason: { code: "MANUAL_SELECTION" },
      entity: "offer",
      entityId: "offer-1",
      previousState: "pending_manual_review",
      newState: "selected",
      commandId: "command-1",
      correlationId: "correlation-1",
      causationId: null,
      result: "applied"
    });

    expect(client.from).toHaveBeenCalledWith("integration_logs");
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "tenant-1",
      integration: "official-state-service",
      action: "state_transition",
      status: "success"
    }));
  });

  it("persists and replays idempotent results through app_settings", async () => {
    const reserve = chain({ data: null, error: null });
    const complete = chain({ data: null, error: null });
    const duplicate = Object.assign(chain({ data: null, error: null }), {
      error: { code: "23505", message: "duplicate key" }
    });
    const appliedResult = {
      status: "applied" as const,
      entityType: "offer" as const,
      entityId: "offer-1",
      tenantId: "tenant-1",
      previousState: "pending_manual_review" as const,
      newState: "selected" as const,
      previousVersion: 0,
      newVersion: 1,
      auditId: "audit-1",
      appliedAt: "2026-07-14T01:00:00.000Z"
    };
    const read = chain({
      data: { value: { fingerprint: "fingerprint-1", status: "completed", result: appliedResult } },
      error: null
    });
    const client = { from: vi.fn()
      .mockReturnValueOnce(reserve)
      .mockReturnValueOnce(complete)
      .mockReturnValueOnce(duplicate)
      .mockReturnValueOnce(read) };
    const adapter = new SupabaseStateAdapter(client as never, "tenant-1");

    await expect(adapter.begin("offer-1:select", "fingerprint-1")).resolves.toEqual({ status: "started" });
    await adapter.complete("offer-1:select", "fingerprint-1", appliedResult);
    await expect(adapter.begin("offer-1:select", "fingerprint-1")).resolves.toEqual({
      status: "replay",
      result: appliedResult
    });
  });
});
