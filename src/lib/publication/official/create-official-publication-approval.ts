import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfficialPublicationApprovalCommand,
  OfficialPublicationApprovalDependencies
} from "@/core/publication";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";
import { transitionOfficialOfferState } from "@/lib/state/official-state-service";
import { evaluateInstagramPolicy } from "@/lib/instagram/policy-guard";
import { createOfficialPublicationServiceDependencies } from "./create-official-publication-service";

export function createOfficialPublicationApprovalDependencies(
  client: SupabaseClient,
  tenantId: string
): OfficialPublicationApprovalDependencies {
  const repository = createOfficialPublicationServiceDependencies(client, tenantId).repository;
  const stateDependencies = createSupabaseStateDependencies(client, tenantId);

  async function ensureInstagramPolicyAllowed(command: OfficialPublicationApprovalCommand) {
    if (command.channel !== "instagram") return null;

    const [{ data: offer, error: offerError }, { data: post, error: postError }] = await Promise.all([
      client
        .from("offers")
        .select("id,product_name,category,notes,platform")
        .eq("id", command.offerId)
        .eq("user_id", command.tenantId)
        .maybeSingle(),
      client
        .from("posts")
        .select("id,content")
        .eq("id", command.postId)
        .eq("user_id", command.tenantId)
        .eq("channel", "instagram")
        .maybeSingle()
    ]);

    if (offerError || postError || !offer || !post) {
      const result = {
        ok: false as const,
        code: "INSTAGRAM_POLICY_INPUT_INVALID" as const,
        rule: "policy_context_unavailable",
        message: "Publicação bloqueada: não foi possível validar o produto e a legenda contra a política do Instagram."
      };
      console.warn(JSON.stringify({
        event: "instagram.policy.blocked",
        offerId: command.offerId,
        postId: command.postId,
        tenantId: command.tenantId,
        rule: result.rule,
        code: result.code,
        reason: result.message
      }));
      return result;
    }

    const result = evaluateInstagramPolicy({
      productName: offer.product_name,
      category: offer.category,
      notes: offer.notes,
      caption: post.content,
      platform: offer.platform
    });

    if (!result.ok) {
      console.warn(JSON.stringify({
        event: "instagram.policy.blocked",
        offerId: command.offerId,
        postId: command.postId,
        tenantId: command.tenantId,
        rule: result.rule,
        code: result.code,
        reason: result.message
      }));
      return result;
    }

    return null;
  }

  return {
    repository,
    selection: {
      select: async (command: OfficialPublicationApprovalCommand) => {
        const policyBlock = await ensureInstagramPolicyAllowed(command);
        if (policyBlock) {
          return { status: "rejected" as const, code: policyBlock.code, message: policyBlock.message };
        }
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
        const policyBlock = await ensureInstagramPolicyAllowed(command);
        if (policyBlock) {
          return { status: "rejected" as const, code: policyBlock.code, message: policyBlock.message };
        }
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
