import type { OfficialAIServiceDependencies } from "./ports";
import { validateOfficialAIContent } from "./content-schema";
import { buildOfficialPrompt } from "./prompt";
import type {
  OfficialAIAuditRecord,
  OfficialAICommand,
  OfficialAIOffer,
  OfficialAIRejectedResult,
  OfficialAIResult
} from "./types";
import { validateCandidateOffer, validateOfficialAICommand } from "./validation";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rejected(command: OfficialAICommand, dependencies: OfficialAIServiceDependencies, code: string, message: string, failureStage: string, offerState: "selected" | "unknown" = "unknown"): OfficialAIRejectedResult {
  return {
    status: "rejected",
    code,
    message,
    commandId: command.commandId,
    offerId: command.offerId,
    offerState,
    failureStage,
    rejectedAt: dependencies.clock.now()
  };
}

function auditBase(command: OfficialAICommand, dependencies: OfficialAIServiceDependencies): Omit<OfficialAIAuditRecord, "provider" | "model" | "latencyMs" | "result" | "replay" | "failureStage" | "errorCode" | "postsPrepared" | "postsPersisted" | "transitionRequested" | "transitionCompleted"> {
  return {
    timestamp: dependencies.clock.now(),
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    causationId: command.causationId,
    offerId: command.offerId,
    tenantId: command.tenantId,
    actor: command.actor,
    origin: command.origin,
    reason: command.reason
  };
}

async function rejectAndRecord(command: OfficialAICommand, dependencies: OfficialAIServiceDependencies, fingerprint: string | null, code: string, message: string, stage: string, offerState: "selected" | "unknown" = "unknown", provider: string | null = null, model: string | null = null, latencyMs: number | null = null, postsPrepared = 0, postsPersisted = 0, transitionRequested = false) {
  const result = rejected(command, dependencies, code, message, stage, offerState);
  await dependencies.audit.register({
    ...auditBase(command, dependencies), provider, model, latencyMs, result: "rejected", replay: false,
    failureStage: stage, errorCode: code, postsPrepared, postsPersisted, transitionRequested, transitionCompleted: false
  });
  if (fingerprint) await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
  return result;
}

function validateOffer(command: OfficialAICommand, offer: OfficialAIOffer | null): { code: string; message: string } | null {
  if (!offer) return { code: "ENTITY_NOT_FOUND", message: "Offer was not found" };
  if (offer.tenantId !== command.tenantId) return { code: "TENANT_MISMATCH", message: "Offer tenant does not match command" };
  if (offer.state !== "selected") return { code: "INVALID_OFFER_STATE", message: "Official AI accepts only selected offers" };
  if (offer.version !== command.expectedVersion) return { code: "VERSION_CONFLICT", message: "Offer version does not match command" };
  const candidateError = validateCandidateOffer(offer);
  return candidateError ? { code: "INVALID_CANDIDATE_CONTRACT", message: candidateError } : null;
}

export async function generateOfficialAI(command: OfficialAICommand, dependencies: OfficialAIServiceDependencies): Promise<OfficialAIResult> {
  const commandError = validateOfficialAICommand(command);
  if (commandError) return rejectAndRecord(command, dependencies, null, "INVALID_AI_COMMAND", commandError, "command");

  const fingerprint = stableSerialize(command);
  const reservation = await dependencies.idempotency.begin(command.idempotencyKey, fingerprint);
  if (reservation.status === "conflict") {
    return rejectAndRecord(command, dependencies, null, "IDEMPOTENCY_CONFLICT", "Idempotency key was used with a different payload", "idempotency");
  }
  if (reservation.status === "replay" || reservation.status === "pending") {
    const result = reservation.status === "replay" ? reservation.result : await reservation.result;
    await dependencies.audit.register({
      ...auditBase(command, dependencies), provider: null, model: null, latencyMs: null,
      result: "idempotent_replay", replay: true, failureStage: null, errorCode: null,
      postsPrepared: 0, postsPersisted: 0, transitionRequested: false, transitionCompleted: false
    });
    return result;
  }

  const offer = await dependencies.offers.findById(command.offerId, command.tenantId);
  const offerError = validateOffer(command, offer);
  if (offerError) {
    return rejectAndRecord(command, dependencies, fingerprint, offerError.code, offerError.message, "preconditions", offer?.state === "selected" ? "selected" : "unknown");
  }

  let provider;
  try {
    provider = dependencies.providers.resolve(command.providerPreference);
  } catch (error) {
    return rejectAndRecord(command, dependencies, fingerprint, "PROVIDER_UNAVAILABLE", error instanceof Error ? error.message : "Provider is unavailable", "provider_resolution", "selected");
  }
  let inference;
  try {
    inference = await provider.generate({
      prompt: buildOfficialPrompt(offer!, command.channels), correlationId: command.correlationId,
      timeoutMs: 30_000, temperature: 0.4, maxTokens: 2_000,
      metadata: { commandId: command.commandId, offerId: command.offerId }
    });
  } catch (error) {
    return rejectAndRecord(command, dependencies, fingerprint, "PROVIDER_FAILURE", error instanceof Error ? error.message : "Provider failed", "provider", "selected", provider.name, provider.model);
  }

  const content = validateOfficialAIContent(inference.content, command.channels);
  if (!content) {
    return rejectAndRecord(command, dependencies, fingerprint, "INVALID_PROVIDER_OUTPUT", "Provider output does not match the official schema", "provider_output", "selected", inference.provider, inference.model, inference.latencyMs);
  }

  let drafts;
  try {
    drafts = await dependencies.content.persistDrafts({ command, offer: offer!, content, channels: command.channels });
  } catch (error) {
    return rejectAndRecord(command, dependencies, fingerprint, "DRAFT_PERSISTENCE_FAILURE", error instanceof Error ? error.message : "Draft persistence failed", "drafts", "selected", inference.provider, inference.model, inference.latencyMs, command.channels.length);
  }
  if (drafts.length !== command.channels.length || drafts.some((draft) => draft.state !== "draft")) {
    return rejectAndRecord(command, dependencies, fingerprint, "INCOMPLETE_DRAFT_SET", "All requested draft posts must be persisted", "drafts", "selected", inference.provider, inference.model, inference.latencyMs, command.channels.length, drafts.length);
  }

  const approval = await dependencies.approval.approveSelected({ command, offer: offer!, drafts });
  if (approval.status === "rejected") {
    return rejectAndRecord(command, dependencies, fingerprint, approval.code, approval.message, "approval", "selected", inference.provider, inference.model, inference.latencyMs, command.channels.length, drafts.length, true);
  }

  const result: OfficialAIResult = {
    status: "approved", commandId: command.commandId, offerId: command.offerId, offerState: "approved",
    content, drafts, providerEvidence: {
      provider: inference.provider, model: inference.model, latencyMs: inference.latencyMs,
      usage: inference.usage, finishReason: inference.finishReason
    },
    stateAuditId: approval.auditId, completedAt: dependencies.clock.now()
  };
  await dependencies.audit.register({
    ...auditBase(command, dependencies), provider: inference.provider, model: inference.model,
    latencyMs: inference.latencyMs, result: "approved", replay: false, failureStage: null, errorCode: null,
    postsPrepared: command.channels.length, postsPersisted: drafts.length, transitionRequested: true, transitionCompleted: true
  });
  await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
  return result;
}
