import { describe, expect, it } from "vitest";
import {
  approveOfficialOfferForPublication,
  type OfficialPublicationApprovalCommand,
  type OfficialPublicationApprovalDependencies
} from "@/core/publication";

const channels = ["whatsapp", "telegram", "instagram"] as const;

function command(channel: (typeof channels)[number] = "whatsapp"): OfficialPublicationApprovalCommand {
  return {
    commandId: "approval-intent-1",
    correlationId: "correlation-1",
    causationId: null,
    tenantId: "tenant-1",
    offerId: "offer-1",
    postId: "post-1",
    channel,
    requestedAt: "2026-07-16T20:00:00.000Z"
  };
}

function fixture(offerState: string, approvalFails = false) {
  const calls: string[] = [];
  const dependencies: OfficialPublicationApprovalDependencies = {
    repository: {
      findOffer: async () => ({ id: "offer-1", tenantId: "tenant-1", state: offerState, version: 0 }),
      findPost: async () => ({
        id: "post-1", tenantId: "tenant-1", offerId: "offer-1", channel: "whatsapp",
        state: "draft", version: 0, content: "copy", mediaUrl: null, destination: "target"
      })
    },
    selection: {
      select: async () => {
        calls.push("selected");
        return { status: "selected", auditId: "selection-audit" };
      }
    },
    approval: {
      approve: async () => {
        calls.push("approved");
        return approvalFails
          ? { status: "rejected", code: "APPROVAL_FAILED", message: "Aprovação oficial falhou" }
          : { status: "approved", auditId: "approval-audit" };
      }
    }
  };
  return { dependencies, calls };
}

describe("approveOfficialOfferForPublication", () => {
  it.each(channels)("moves pending_manual_review through selected and approved for %s", async (channel) => {
    const test = fixture("pending_manual_review");
    test.dependencies.repository.findPost = async () => ({
      id: "post-1", tenantId: "tenant-1", offerId: "offer-1", channel,
      state: "draft", version: 0, content: "copy", mediaUrl: null, destination: "target"
    });

    const result = await approveOfficialOfferForPublication(command(channel), test.dependencies);

    expect(result).toMatchObject({ status: "approved", offerState: "approved" });
    expect(test.calls).toEqual(["selected", "approved"]);
  });

  it("stops after an approval failure", async () => {
    const test = fixture("pending_manual_review", true);
    const result = await approveOfficialOfferForPublication(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "APPROVAL_FAILED", failureStage: "approval" });
    expect(test.calls).toEqual(["selected", "approved"]);
  });

  it("publishes directly from approved without selection or AI approval", async () => {
    const test = fixture("approved");
    const result = await approveOfficialOfferForPublication(command(), test.dependencies);
    expect(result).toMatchObject({ status: "approved", offerState: "approved" });
    expect(test.calls).toEqual([]);
  });

  it("rejects a non-draft post before changing the offer", async () => {
    const test = fixture("pending_manual_review");
    test.dependencies.repository.findPost = async () => ({
      id: "post-1", tenantId: "tenant-1", offerId: "offer-1", channel: "whatsapp",
      state: "published", version: 1, content: "copy", mediaUrl: null, destination: "target"
    });
    const result = await approveOfficialOfferForPublication(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "POST_STATE_MISMATCH", failureStage: "post_state" });
    expect(test.calls).toEqual([]);
  });
});
