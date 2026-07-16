import type { PublicationRepositoryPort } from "./ports";
import type { OfficialPublicationChannel } from "./types";

export interface OfficialPublicationApprovalCommand {
  commandId: string;
  correlationId: string;
  causationId: string | null;
  tenantId: string;
  offerId: string;
  postId: string;
  channel: OfficialPublicationChannel;
  requestedAt: string;
}

type ApprovalStepRejected = { status: "rejected"; code: string; message: string };

export interface OfficialPublicationApprovalDependencies {
  repository: PublicationRepositoryPort;
  selection: {
    select(command: OfficialPublicationApprovalCommand): Promise<
      { status: "selected"; auditId: string } | ApprovalStepRejected
    >;
  };
  approval: {
    approve(command: OfficialPublicationApprovalCommand): Promise<
      { status: "approved"; auditId: string } | ApprovalStepRejected
    >;
  };
}

export type OfficialPublicationApprovalResult =
  | {
      status: "approved";
      commandId: string;
      offerId: string;
      postId: string;
      channel: OfficialPublicationChannel;
      offerState: "approved";
      selectionAuditId: string | null;
      approvalAuditId: string | null;
    }
  | {
      status: "rejected";
      commandId: string;
      offerId: string;
      postId: string;
      channel: OfficialPublicationChannel;
      code: string;
      message: string;
      failureStage: string;
    };

function rejected(
  command: OfficialPublicationApprovalCommand,
  code: string,
  message: string,
  failureStage: string
): OfficialPublicationApprovalResult {
  return {
    status: "rejected",
    commandId: command.commandId,
    offerId: command.offerId,
    postId: command.postId,
    channel: command.channel,
    code,
    message,
    failureStage
  };
}

export async function approveOfficialOfferForPublication(
  command: OfficialPublicationApprovalCommand,
  dependencies: OfficialPublicationApprovalDependencies
): Promise<OfficialPublicationApprovalResult> {
  const [offer, post] = await Promise.all([
    dependencies.repository.findOffer(command.offerId, command.tenantId),
    dependencies.repository.findPost(command.postId, command.tenantId)
  ]);

  if (!offer) return rejected(command, "OFFER_NOT_FOUND", "Offer was not found", "offer");
  if (!post) return rejected(command, "POST_NOT_FOUND", "Post was not found", "post");
  if (offer.tenantId !== command.tenantId || post.tenantId !== command.tenantId) {
    return rejected(command, "TENANT_MISMATCH", "Offer or post belongs to another tenant", "tenant");
  }
  if (post.offerId !== offer.id || post.offerId !== command.offerId) {
    return rejected(command, "POST_OFFER_MISMATCH", "Post does not belong to the offer", "relationship");
  }
  if (post.channel !== command.channel) {
    return rejected(command, "CHANNEL_MISMATCH", "Post channel differs from command channel", "channel");
  }
  if (post.state !== "draft") {
    return rejected(command, "POST_STATE_MISMATCH", "Official approval requires draft post", "post_state");
  }

  let offerState = offer.state;
  let selectionAuditId: string | null = null;
  if (offerState === "pending_manual_review") {
    const selection = await dependencies.selection.select(command);
    if (selection.status === "rejected") {
      return rejected(command, selection.code, selection.message, "selection");
    }
    selectionAuditId = selection.auditId;
    offerState = "selected";
  }

  let approvalAuditId: string | null = null;
  if (offerState === "selected") {
    const approval = await dependencies.approval.approve(command);
    if (approval.status === "rejected") {
      return rejected(command, approval.code, approval.message, "approval");
    }
    approvalAuditId = approval.auditId;
    offerState = "approved";
  }

  if (offerState !== "approved") {
    return rejected(command, "OFFER_STATE_MISMATCH", `Official approval cannot process offer in state ${offerState}`, "offer_state");
  }

  return {
    status: "approved",
    commandId: command.commandId,
    offerId: command.offerId,
    postId: command.postId,
    channel: command.channel,
    offerState: "approved",
    selectionAuditId,
    approvalAuditId
  };
}
