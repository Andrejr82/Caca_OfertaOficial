import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfficialPublicationApprovalCommand,
  OfficialPublicationApprovalDependencies
} from "@/core/publication";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";
import { transitionOfficialOfferState } from "@/lib/state/official-state-service";
import { createOfficialPublicationServiceDependencies } from "./create-official-publication-service";

export function createOfficialPublicationApprovalDependencies(
  client: SupabaseClient,
  tenantId: string
): OfficialPublicationApprovalDependencies {
  const repository = createOfficialPublicationServiceDependencies(client, tenantId).repository;
  const stateDependencies = createSupabaseStateDependencies(client, tenantId);
  return {
    repository,
    selection: {
      select: async (command: OfficialPublicationApprovalCommand) => {
        const result = await transitionOfficialOfferState({
          commandId: `${command.commandId}:select`,
          idempotencyKey: `curation:${command.offerId}:select:${command.commandId}`,
          correlationId: command.correlationId,
          causationId: command.causationId,
          tenantId: command.tenantId,
          actor: { type: "user", id: command.tenantId, service: "nextjs-publication-approval" },
          requestedAt: command.requestedAt,
          entityId: command.offerId,
          fromState: "pending_manual_review",
          toState: "selected",
          origin: "publication.approval.manual-selection",
          reason: { code: "MANUAL_SELECTION", detail: command.channel },
          evidenceRefs: [`post:${command.postId}:draft`, `channel:${command.channel}`]
        }, stateDependencies);
        return result.status === "applied"
          ? { status: "selected" as const, auditId: result.auditId }
          : { status: "rejected" as const, code: result.code, message: result.message };
      }
    },
    approval: {
      approve: async (command: OfficialPublicationApprovalCommand) => {
        const result = await transitionOfficialOfferState({
          commandId: `${command.commandId}:approve`,
          idempotencyKey: `publication:${command.offerId}:approve:${command.commandId}`,
          correlationId: command.correlationId,
          causationId: command.causationId,
          tenantId: command.tenantId,
          actor: { type: "user", id: command.tenantId, service: "nextjs-publication-approval" },
          requestedAt: command.requestedAt,
          entityId: command.offerId,
          fromState: "selected",
          toState: "approved",
          origin: "publication.approval.manual-approval",
          reason: { code: "MANUAL_APPROVAL", detail: command.channel },
          evidenceRefs: [`post:${command.postId}:draft`, `channel:${command.channel}`]
        }, stateDependencies);
        return result.status === "applied"
          ? { status: "approved" as const, auditId: result.auditId }
          : { status: "rejected" as const, code: result.code, message: result.message };
      }
    },
    reconciliation: {
      reconcile: async (command: OfficialPublicationApprovalCommand) => {
        const result = await transitionOfficialOfferState({
          commandId: `${command.commandId}:reconcile`,
          idempotencyKey: `publication:${command.offerId}:reconcile:${command.commandId}`,
          correlationId: command.correlationId,
          causationId: command.causationId,
          tenantId: command.tenantId,
          actor: { type: "service", id: "official-publication-service", service: "official-publication-service" },
          requestedAt: command.requestedAt,
          entityId: command.offerId,
          fromState: "posted",
          toState: "approved",
          origin: "publication.approval.premature-post-reconciliation",
          reason: { code: "PUBLICATION_RECONCILIATION", detail: command.channel },
          evidenceRefs: [`post:${command.postId}:draft`, `channel:${command.channel}`]
        }, stateDependencies);
        return result.status === "applied"
          ? { status: "approved" as const, auditId: result.auditId }
          : { status: "rejected" as const, code: result.code, message: result.message };
      }
    }
  };
}
