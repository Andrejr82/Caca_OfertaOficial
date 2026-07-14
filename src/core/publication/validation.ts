import { OFFICIAL_PUBLICATION_CHANNELS, type OfficialPublicationCommand, type OfficialPublicationReceipt } from "./types";

const nonEmptyFields = [
  "commandId", "idempotencyKey", "correlationId", "offerId", "postId", "tenantId",
  "payloadReference", "requestedAt", "origin"
] as const;

export function validatePublicationCommand(command: OfficialPublicationCommand): { code: string; message: string } | null {
  if (command.contractVersion !== "pmav5.publication/v1") {
    return { code: "INVALID_CONTRACT", message: "Publication contract version is invalid" };
  }
  if (nonEmptyFields.some((field) => typeof command[field] !== "string" || !command[field].trim())) {
    return { code: "INVALID_COMMAND", message: "Publication command has missing required fields" };
  }
  if (!OFFICIAL_PUBLICATION_CHANNELS.includes(command.channel)) {
    return { code: "INVALID_CHANNEL", message: "Publication channel is invalid" };
  }
  if (command.expectedOfferState !== "approved" || command.expectedOfferVersion !== 2) {
    return { code: "INVALID_EXPECTED_OFFER_STATE", message: "Publication requires approved offer version 2" };
  }
  if (command.expectedPostState !== "draft" || command.expectedPostVersion !== 0) {
    return { code: "INVALID_EXPECTED_POST_STATE", message: "Publication requires draft post version 0" };
  }
  if (!command.actor?.id || !command.actor?.type || !command.reason?.code) {
    return { code: "INVALID_ACTOR", message: "Publication actor and reason are required" };
  }
  return null;
}

export function validateFinalReceipt(receipt: OfficialPublicationReceipt, command: OfficialPublicationCommand): boolean {
  return receipt.receiptVersion === "pmav5.receipt/v1"
    && receipt.commandId === command.commandId
    && receipt.idempotencyKey === command.idempotencyKey
    && receipt.correlationId === command.correlationId
    && receipt.causationId === command.causationId
    && receipt.tenantId === command.tenantId
    && receipt.offerId === command.offerId
    && receipt.postId === command.postId
    && receipt.channel === command.channel
    && receipt.accepted === true
    && receipt.outcome === "confirmed"
    && receipt.deliveryStatus === "confirmed"
    && typeof receipt.externalId === "string"
    && receipt.externalId.trim().length > 0
    && receipt.receiptId.trim().length > 0
    && receipt.evidenceHash.trim().length > 0;
}
