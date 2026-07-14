import type { PublicationTransportPort, PublicationTransportRequest } from "../ports";
import { confirmedReceipt, technicalInput, type TransportDependencies } from "./transport-base";

export class TelegramPublicationTransport implements PublicationTransportPort {
  readonly channel = "telegram" as const;
  constructor(private readonly dependencies: TransportDependencies) {}

  async publish(request: PublicationTransportRequest) {
    if (request.channel !== this.channel) throw new Error("Telegram transport channel mismatch");
    const result = await this.dependencies.send(technicalInput(request));
    return confirmedReceipt(request, this.dependencies, "telegram-bot-api", result);
  }
}
