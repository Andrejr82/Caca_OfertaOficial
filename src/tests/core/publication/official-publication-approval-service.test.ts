import { describe, expect, it, vi } from "vitest";
import {
  approveOfficialOfferForPublication,
  type OfficialPublicationApprovalCommand,
  type OfficialPublicationApprovalDependencies
} from "@/core/publication";

const command: OfficialPublicationApprovalCommand = {
  commandId: "intent-1",
  correlationId: "intent-1",
  causationId: null,
  tenantId: "tenant-1",
  offerId: "offer-1",
  postId: "post-1",
  channel: "telegram",
  requestedAt: "2026-07-16T12:00:00.000Z"
};

function dependencies(offerState: string): OfficialPublicationApprovalDependencies & {
  selectedCalls: number;
  approvedCalls: number;
} {
  let selectedCalls = 0;
  let approvedCalls = 0;
  return {
    repository: {
      findOffer: vi.fn(async () => ({ id: "offer-1", tenantId: "tenant-1", state: offerState, version: offerState === "approved" ? 2 : offerState === "selected" ? 1 : 0 })),
      findPost: vi.fn(async () => ({
        id: "post-1", tenantId: "tenant-1", offerId: "offer-1", channel: "telegram",
        state: "draft", version: 0, content: "content", mediaUrl: null, destination: "@offers"
      })),
      findPostsByOffer: vi.fn(async () => [])
    },
    selection: {
      select: vi.fn(async () => { selectedCalls += 1; return { status: "selected" as const, auditId: "selection-audit" }; })
    },
    approval: {
      approve: vi.fn(async () => { approvedCalls += 1; return { status: "approved" as const, auditId: "approval-audit" }; })
    },
    reconciliation: {
      reconcile: vi.fn(async () => ({ status: "approved" as const, auditId: "reconciliation-audit" }))
    },
    get selectedCalls() { return selectedCalls; },
    get approvedCalls() { return approvedCalls; }
  };
}

describe("approveOfficialOfferForPublication", () => {
  it("moves pending_manual_review through selected to approved", async () => {
    const deps = dependencies("pending_manual_review");

    const result = await approveOfficialOfferForPublication(command, deps);

    expect(result).toMatchObject({ status: "approved", offerState: "approved", selectionAuditId: "selection-audit", approvalAuditId: "approval-audit" });
    expect(deps.selectedCalls).toBe(1);
    expect(deps.approvedCalls).toBe(1);
  });

  it("approves selected offers without selecting again", async () => {
    const deps = dependencies("selected");

    const result = await approveOfficialOfferForPublication(command, deps);

    expect(result).toMatchObject({ status: "approved", offerState: "approved", selectionAuditId: null });
    expect(deps.selectedCalls).toBe(0);
    expect(deps.approvedCalls).toBe(1);
  });

  it("does not call approval transitions for an already approved offer", async () => {
    const deps = dependencies("approved");

    const result = await approveOfficialOfferForPublication(command, deps);

    expect(result).toMatchObject({ status: "approved", offerState: "approved", selectionAuditId: null, approvalAuditId: null });
    expect(deps.selectedCalls).toBe(0);
    expect(deps.approvedCalls).toBe(0);
  });

  it("stops before publication approval when the post is not draft", async () => {
    const deps = dependencies("selected");
    deps.repository.findPost = vi.fn(async () => ({
      id: "post-1", tenantId: "tenant-1", offerId: "offer-1", channel: "telegram",
      state: "published", version: 1, content: "content", mediaUrl: null, destination: "@offers"
    }));

    const result = await approveOfficialOfferForPublication(command, deps);

    expect(result).toMatchObject({ status: "rejected", code: "POST_STATE_MISMATCH" });
    expect(deps.selectedCalls).toBe(0);
    expect(deps.approvedCalls).toBe(0);
  });

  it("returns approval failure without proceeding to the publication service", async () => {
    const deps = dependencies("selected");
    deps.approval.approve = vi.fn(async () => ({ status: "rejected" as const, code: "STATE_CONFLICT", message: "conflict" }));

    const result = await approveOfficialOfferForPublication(command, deps);

    expect(result).toMatchObject({ status: "rejected", code: "STATE_CONFLICT", failureStage: "approval" });
  });

  it("rejects a posted offer without attempting the forbidden posted-to-approved transition", async () => {
    const deps = dependencies("posted");
    deps.repository.findPostsByOffer = vi.fn(async () => [
      { id: "post-1", tenantId: "tenant-1", offerId: "offer-1", channel: "telegram", state: "draft", version: 0, content: "content", mediaUrl: null, destination: "@offers" },
      { id: "post-2", tenantId: "tenant-1", offerId: "offer-1", channel: "whatsapp", state: "published", version: 1, content: "content", mediaUrl: null, destination: "group" }
    ]);

    const result = await approveOfficialOfferForPublication(command, deps);

    expect(result).toMatchObject({ status: "rejected", code: "OFFER_ALREADY_POSTED", failureStage: "offer_state" });
    expect(deps.reconciliation.reconcile).not.toHaveBeenCalled();
  });
});
