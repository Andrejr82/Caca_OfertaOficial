import type { PublicationTransportPort, PublicationTransportRequest } from "../ports";
import { confirmedReceipt, technicalInput, type TransportDependencies } from "./transport-base";

export class WhatsAppPublicationTransport implements PublicationTransportPort {
  readonly channel = "whatsapp" as const;
  constructor(private readonly dependencies: TransportDependencies) {}

  async publish(request: PublicationTransportRequest) {
    if (request.channel !== this.channel) throw new Error("WhatsApp transport channel mismatch");
    const result = await this.dependencies.send(technicalInput(request));
    return confirmedReceipt(request, this.dependencies, "whatsapp-engine", result);
  }
}
