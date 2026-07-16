import type { OfficialPublicationChannel } from "@/core/publication";

interface ApproveAndPublishInput {
  postId: string;
  offerId: string;
  channel: OfficialPublicationChannel;
  requestSource: string;
  commandId?: string;
}

async function responseBody(response: Response) {
  return await response.json() as { ok?: boolean; offerState?: string; message?: string; result?: unknown };
}

export async function approveAndPublishOfficialPost(input: ApproveAndPublishInput) {
  const commandId = input.commandId ?? crypto.randomUUID();
  const body = {
    postId: input.postId,
    offerId: input.offerId,
    channel: input.channel,
    commandId,
    requestSource: input.requestSource
  };
  const approvalResponse = await fetch("/api/publication/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const approval = await responseBody(approvalResponse);
  if (!approvalResponse.ok || !approval.ok || approval.offerState !== "approved") {
    throw new Error(approval.message || `Oferta não aprovada: ${approval.offerState ?? "unknown"}`);
  }

  const publicationResponse = await fetch(`/api/${input.channel}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      idempotencyKey: `publication:${input.postId}:${input.channel}:intent:${commandId}`
    })
  });
  const publication = await responseBody(publicationResponse);
  if (!publicationResponse.ok || !publication.ok) {
    throw new Error(publication.message || "Falha na publicação oficial.");
  }
  return publication;
}
