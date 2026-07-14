import { OFFICIAL_AI_CHANNELS, type OfficialAICommand, type OfficialAIOffer } from "./types";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateOfficialAICommand(command: OfficialAICommand): string | null {
  if (command.contractVersion !== "pmav5.ai/v1") return "Unsupported AI contract version";
  if (![command.commandId, command.idempotencyKey, command.correlationId, command.offerId, command.tenantId, command.requestedAt, command.origin].every(nonEmpty)) {
    return "Required command identity is missing";
  }
  if (command.expectedState !== "selected" || command.expectedVersion !== 1) {
    return "AI command must expect selected version 1";
  }
  if (command.idempotencyKey !== `ai:${command.offerId}:v${command.expectedVersion}`) {
    return "AI idempotency key must be stable by offer and version";
  }
  if (!command.actor || !nonEmpty(command.actor.id) || !command.reason || !nonEmpty(command.reason.code)) {
    return "Actor and reason are required";
  }
  if (!Array.isArray(command.channels) || command.channels.length === 0) return "At least one channel is required";
  const unique = new Set(command.channels);
  if (unique.size !== command.channels.length || command.channels.some((channel) => !OFFICIAL_AI_CHANNELS.includes(channel))) {
    return "Channels must be unique and officially supported";
  }
  return null;
}

export function validateCandidateOffer(offer: OfficialAIOffer): string | null {
  const evidence = offer.explainability || {};
  if (evidence.contract_version !== "pmav5.candidate/v1") return "Candidate contract version is invalid";
  if (![evidence.candidate_id, evidence.ingestion_id, evidence.correlation_id].every(nonEmpty)) {
    return "Candidate identity evidence is incomplete";
  }
  if (!evidence.discovery_evidence || !evidence.marketplace_metrics) return "Candidate evidence is incomplete";
  if (![offer.marketplace, offer.productName, offer.originalUrl, offer.imageUrl].every(nonEmpty)) return "Candidate fields are incomplete";
  if (!/^https:\/\//i.test(offer.originalUrl) || !/^https:\/\//i.test(offer.imageUrl)) return "Candidate URLs must use HTTPS";
  if (!Number.isFinite(offer.currentPrice) || offer.currentPrice <= 0) return "Candidate current price is invalid";
  if (offer.originalPrice !== null && (!Number.isFinite(offer.originalPrice) || offer.originalPrice < offer.currentPrice)) {
    return "Candidate original price is invalid";
  }
  return null;
}
