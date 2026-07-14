import type { PublicationTransportPort, PublicationTransportRequest } from "../ports";
import { confirmedReceipt, technicalInput, type TransportDependencies } from "./transport-base";

export class InstagramPublicationTransport implements PublicationTransportPort {
  readonly channel = "instagram" as const;
  constructor(private readonly dependencies: TransportDependencies) {}

  async publish(request: PublicationTransportRequest) {
    if (request.channel !== this.channel) throw new Error("Instagram transport channel mismatch");
    const result = await this.dependencies.send(technicalInput(request));
    if (result.final !== true) throw new Error("Instagram asynchronous job has no final receipt");
    return confirmedReceipt(request, this.dependencies, "meta-instagram-graph", result);
  }
}
