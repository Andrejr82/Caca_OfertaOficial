import type { PublicationTransportPort, PublicationTransportRequest } from "../ports";
import { confirmedReceipt, technicalInput, type TransportDependencies } from "./transport-base";

export class FacebookPublicationTransport implements PublicationTransportPort {
  readonly channel = "facebook" as const;
  constructor(private readonly dependencies: TransportDependencies) {}

  async publish(request: PublicationTransportRequest) {
    if (request.channel !== this.channel) throw new Error("Facebook transport channel mismatch");
    const result = await this.dependencies.send(technicalInput(request));
    return confirmedReceipt(request, this.dependencies, "meta-facebook-graph", result);
  }
}
