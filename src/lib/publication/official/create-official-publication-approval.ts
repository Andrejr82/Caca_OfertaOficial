import type { SupabaseClient } from "@supabase/supabase-js";
import { generateOfficialAI, type OfficialAICommand } from "@/core/ai";
import type {
  OfficialPublicationApprovalCommand,
  OfficialPublicationApprovalDependencies
} from "@/core/publication";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
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
        const aiCommand: OfficialAICommand = {
          contractVersion: "pmav5.ai/v1",
          commandId: `${command.commandId}:ai-approval`,
          idempotencyKey: `ai:${command.offerId}:v1`,
          correlationId: command.correlationId,
          causationId: `${command.commandId}:select`,
          offerId: command.offerId,
          tenantId: command.tenantId,
          channels: ["telegram", "instagram", "whatsapp"],
          requestedAt: command.requestedAt,
          actor: { type: "user", id: command.tenantId, service: "nextjs-publication-approval" },
          origin: "publication.approval.official-ai",
          reason: { code: "GENERATE_OFFICIAL_CONTENT" }
        };
        const result = await generateOfficialAI(
          aiCommand,
          createOfficialAIServiceDependencies(client, tenantId)
        );
        return result.status === "approved"
          ? { status: "approved" as const, auditId: result.stateAuditId ?? `${command.commandId}:ai-approval` }
          : {
              status: "rejected" as const,
              code: result.status === "rejected" ? result.code : "APPROVAL_STATE_MISMATCH",
              message: result.status === "rejected" ? result.message : `Official AI returned ${result.status}`
            };
      }
    }
  };
}
