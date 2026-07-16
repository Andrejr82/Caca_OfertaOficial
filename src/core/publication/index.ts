export { publishOfficialPost } from "./official-publication-service";
export { validateFinalReceipt, validatePublicationCommand } from "./validation";
export type {
  ClockPort,
  OfficialPublicationServiceDependencies,
  PublicationAuditPort,
  PublicationReceiptPort,
  PublicationRepositoryPort,
  PublicationReservationPort,
  PublicationStatePort,
  PublicationTransportPort,
  PublicationTransportRegistryPort,
  PublicationTransportRequest,
  UUIDPort
} from "./ports";
export type {
  OfficialPublicationChannel,
  OfficialPublicationCommand,
  OfficialPublicationOffer,
  OfficialPublicationPost,
  OfficialPublicationPublishedResult,
  OfficialPublicationReceipt,
  OfficialPublicationRejectedResult,
  OfficialPublicationResult,
  PublicationAuditRecord
} from "./types";
