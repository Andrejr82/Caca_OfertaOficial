import type { ClockPort, PublicationTransportRequest, UUIDPort } from "../ports";
import type { OfficialPublicationReceipt } from "../types";

export interface TechnicalSendInput {
  text: string;
  mediaUrl: string | null;
  destination: string;
  requestId: string;
  correlationId: string;
  timeoutMs: number;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface TechnicalSendResult {
  externalId: string;
  sentAt: string;
  final?: boolean;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface TransportDependencies {
  send(input: TechnicalSendInput): Promise<TechnicalSendResult>;
  clock: ClockPort;
  uuid: UUIDPort;
  evidenceHash(value: string): string;
}

export function technicalInput(request: PublicationTransportRequest): TechnicalSendInput {
  return {
    text: request.content,
    mediaUrl: request.mediaUrl,
    destination: request.destination,
    requestId: request.commandId,
    correlationId: request.correlationId,
    timeoutMs: request.timeoutMs,
    metadata: request.metadata
  };
}

export function confirmedReceipt(
  request: PublicationTransportRequest,
  dependencies: TransportDependencies,
  provider: string,
  result: TechnicalSendResult
): OfficialPublicationReceipt {
  if (!result.externalId?.trim()) throw new Error(`${provider} did not return an external id`);
  const receiptId = dependencies.uuid.generate();
  const observedAt = dependencies.clock.now();
  const evidence = JSON.stringify({
    receiptId,
    commandId: request.commandId,
    postId: request.postId,
    channel: request.channel,
    provider,
    externalId: result.externalId,
    sentAt: result.sentAt
  });
  return {
    receiptVersion: "pmav5.receipt/v1",
    receiptId,
    commandId: request.commandId,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
    causationId: request.causationId,
    tenantId: request.tenantId,
    offerId: request.offerId,
    postId: request.postId,
    channel: request.channel,
    provider,
    externalId: result.externalId,
    sentAt: result.sentAt,
    observedAt,
    accepted: true,
    deliveryStatus: "confirmed",
    outcome: "confirmed",
    evidenceHash: dependencies.evidenceHash(evidence),
    metadata: result.metadata ?? {}
  };
}
