import { describe, expect, it, vi } from "vitest";

import { CompatibilityStateAdapter } from "@/core/state/adapters/compatibility-adapter";
import { FutureSupabaseStateAdapter } from "@/core/state/adapters/future-supabase-adapter";
import type { StateEntity } from "@/core/state";

const entity: StateEntity = {
  entityType: "offer",
  entityId: "offer-1",
  tenantId: "tenant-1",
  state: "pending_manual_review",
  version: 1
};

function createBindings() {
  return {
    findById: vi.fn(async () => entity),
    compareAndSet: vi.fn(async () => ({ status: "applied" as const, entity })),
    registerAudit: vi.fn(async () => undefined),
    beginIdempotency: vi.fn(async () => ({ status: "started" as const })),
    completeIdempotency: vi.fn(async () => undefined)
  };
}

describe("CompatibilityStateAdapter", () => {
  it("does not invoke legacy bindings automatically", () => {
    const bindings = createBindings();

    new CompatibilityStateAdapter(bindings);

    expect(bindings.findById).not.toHaveBeenCalled();
    expect(bindings.compareAndSet).not.toHaveBeenCalled();
    expect(bindings.registerAudit).not.toHaveBeenCalled();
  });

  it("delegates persistence only when explicitly called", async () => {
    const bindings = createBindings();
    const adapter = new CompatibilityStateAdapter(bindings);

    await expect(adapter.findById("offer", "offer-1", "tenant-1")).resolves.toBe(entity);

    expect(bindings.findById).toHaveBeenCalledWith("offer", "offer-1", "tenant-1");
  });
});

describe("FutureSupabaseStateAdapter", () => {
  it("has no Supabase side effects during construction", () => {
    const gateway = createBindings();

    new FutureSupabaseStateAdapter(gateway);

    expect(gateway.findById).not.toHaveBeenCalled();
    expect(gateway.compareAndSet).not.toHaveBeenCalled();
  });

  it("delegates to an injected future gateway without importing Supabase", async () => {
    const gateway = createBindings();
    const adapter = new FutureSupabaseStateAdapter(gateway);

    await expect(adapter.findById("offer", "offer-1", "tenant-1")).resolves.toBe(entity);

    expect(gateway.findById).toHaveBeenCalledTimes(1);
  });
});
