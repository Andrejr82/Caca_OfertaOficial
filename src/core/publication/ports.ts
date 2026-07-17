import type {
  OfficialPublicationChannel,
  OfficialPublicationCommand,
  OfficialPublicationOffer,
  OfficialPublicationPost,
  OfficialPublicationReceipt,
  OfficialPublicationResult,
  PublicationAuditRecord
} from "./types";

export interface PublicationTransportRequest {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  tenantId: string;
  offerId: string;
  postId: string;
  channel: OfficialPublicationChannel;
  content: string;
  mediaUrl: string | null;
  destination: string;
  timeoutMs: number;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface PublicationTransportPort {
  readonly channel: OfficialPublicationChannel;
  publish(request: PublicationTransportRequest): Promise<OfficialPublicationReceipt>;
}

export interface PublicationTransportRegistryPort {
  resolve(channel: OfficialPublicationChannel): PublicationTransportPort;
}

export interface PublicationRepositoryPort {
  findOffer(offerId: string, tenantId: string): Promise<OfficialPublicationOffer | null>;
  findPost(postId: string, tenantId: string): Promise<OfficialPublicationPost | null>;
  findPostsByOffer(offerId: string, tenantId: string): Promise<readonly OfficialPublicationPost[]>;
}

export interface PublicationReceiptPort {
  findFinal(command: OfficialPublicationCommand): Promise<OfficialPublicationReceipt | null>;
  save(receipt: OfficialPublicationReceipt): Promise<void>;
}

export type PublicationReservationBegin =
  | { status: "started" }
  | { status: "resume" }
  | { status: "conflict" }
  | { status: "replay"; result: OfficialPublicationResult }
  | { status: "pending"; result: Promise<OfficialPublicationResult> };

export interface PublicationReservationPort {
  begin(idempotencyKey: string, fingerprint: string, command: OfficialPublicationCommand): Promise<PublicationReservationBegin>;
  markReceiptRecorded(idempotencyKey: string, fingerprint: string, receipt: OfficialPublicationReceipt): Promise<void>;
  markReconciliationRequired(
    idempotencyKey: string,
    fingerprint: string,
    result: OfficialPublicationResult,
    receipt?: OfficialPublicationReceipt
  ): Promise<void>;
  complete(idempotencyKey: string, fingerprint: string, result: OfficialPublicationResult): Promise<void>;
}

export type PublicationStateResult =
  | { status: "applied" | "replay"; auditId: string; newState: "published" | "posted" | "approved" }
  | { status: "rejected"; code: string; message: string };

export interface PublicationStatePort {
  publishPost(input: { command: OfficialPublicationCommand; receipt: OfficialPublicationReceipt }): Promise<PublicationStateResult>;
  concludeOffer(input: { command: OfficialPublicationCommand; receipt: OfficialPublicationReceipt }): Promise<PublicationStateResult>;
  reconcileOffer(input: { command: OfficialPublicationCommand }): Promise<PublicationStateResult>;
}

export interface PublicationAuditPort {
  register(record: PublicationAuditRecord): Promise<void>;
}

export interface ClockPort { now(): string }
export interface UUIDPort { generate(): string }

export interface OfficialPublicationServiceDependencies {
  repository: PublicationRepositoryPort;
  transports: PublicationTransportRegistryPort;
  receipts: PublicationReceiptPort;
  reservations: PublicationReservationPort;
  state: PublicationStatePort;
  audit: PublicationAuditPort;
  clock: ClockPort;
  uuid: UUIDPort;
}
