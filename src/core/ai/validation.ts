import { OFFICIAL_AI_CHANNELS, type OfficialAICommand, type OfficialAIOffer } from "./types";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateOfficialAICommand(command: OfficialAICommand): string | null {
  if (command.contractVersion !== "pmav5.ai/v1") return "Unsupported AI contract version";
  if (![command.commandId, command.idempotencyKey, command.correlationId, command.offerId, command.tenantId, command.requestedAt, command.origin].every(nonEmpty)) {
    return "Required command identity is missing";
  }
  if (command.metadata?.copyV2Auto === true && command.metadata.copyV2 !== true) return "Automated Copy V2 requires copyV2 metadata";
  // Idempotency key deve ser estável por offer (ADR-014: a IA detecta o modo internamente).
  // Formato v1 (approval e legado): ai:{offerId}:v1
  // Formato v2 (draft batch): ai:draft:{offerId}:v2
  if (command.batch) {
    if (command.batch.operation !== "PROCESS_OFFERS") return "Unsupported AI batch operation";
    if (!Number.isInteger(command.batch.pageNumber) || command.batch.pageNumber < 1
      || !Number.isInteger(command.batch.totalPages) || command.batch.totalPages < command.batch.pageNumber) {
      return "AI cycle page coordinates are invalid";
    }
    if (!Array.isArray(command.batch.offerIds) || command.batch.offerIds.length === 0 || command.batch.offerIds.length > 50) {
      return "AI cycle page must contain between 1 and 50 offer IDs";
    }
    if (new Set(command.batch.offerIds).size !== command.batch.offerIds.length
      || command.batch.offerIds.some((id) => !nonEmpty(id))) {
      return "AI cycle page offer IDs must be unique and non-empty";
    }
    const expectedPageKey = `ai:cycle:${command.correlationId}:page:${command.batch.pageNumber}:v1`;
    if (command.idempotencyKey !== expectedPageKey) return "AI cycle page idempotency key is invalid";
  } else if (command.offerId !== "ALL_PENDING") {
    const isV1 = command.idempotencyKey === `ai:${command.offerId}:v1`;
    const isV2Draft = command.idempotencyKey === `ai:draft:${command.offerId}:v2`;
    const isCopyV2 = command.idempotencyKey === `ai:copy-v2:${command.offerId}:v1` && command.metadata?.copyV2 === true;
    if (!isV1 && !isV2Draft && !isCopyV2) {
      return "AI idempotency key must be ai:{offerId}:v1, ai:draft:{offerId}:v2 or ai:copy-v2:{offerId}:v1";
    }
  }
  if (command.offerId === "ALL_PENDING" && !command.idempotencyKey.startsWith("ai:ALL_PENDING:") && !command.idempotencyKey.startsWith("ai:batch:")) {
    return "AI batch command must have idempotency key starting with ai:ALL_PENDING: or ai:batch:";
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
