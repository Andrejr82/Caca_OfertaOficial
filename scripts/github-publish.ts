import { publishOfficialPost, type OfficialPublicationChannel, type OfficialPublicationCommand } from "../src/core/publication";
import {
  createOfficialPublicationServiceDependencies,
  publicationIdempotencyKey,
  publicationPayloadReference
} from "../src/lib/publication/official/create-official-publication-service";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

async function main() {
  const tenantId = process.env.INPUT_TENANT_ID || "";
  const offerId = process.env.INPUT_OFFER_ID || "";
  const postId = process.env.INPUT_POST_ID || "";
  const channel = (process.env.INPUT_CHANNEL || "instagram") as OfficialPublicationChannel;
  const commandId = process.env.GITHUB_RUN_ID ? `github:${process.env.GITHUB_RUN_ID}` : `github:${postId}:${channel}`;
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("Official publication dependencies are unavailable");

  const command: OfficialPublicationCommand = {
    contractVersion: "pmav5.publication/v1",
    commandId,
    idempotencyKey: publicationIdempotencyKey(postId, channel),
    correlationId: commandId,
    causationId: null,
    offerId,
    postId,
    tenantId,
    channel,
    expectedOfferState: "approved",
    expectedOfferVersion: 2,
    expectedPostState: "draft",
    expectedPostVersion: 0,
    payloadReference: publicationPayloadReference(postId),
    requestedAt: new Date().toISOString(),
    actor: { type: "service", id: "github-actions", service: "github-actions" },
    origin: "github-actions.official-publication-client",
    reason: { code: "PUBLISH_OFFICIAL_POST" },
    metadata: { instagramMode: "synchronous" }
  };

  const result = await publishOfficialPost(command, createOfficialPublicationServiceDependencies(client, tenantId));
  if (result.status !== "published") throw new Error(`${result.code}: ${result.message}`);
  console.log(JSON.stringify({ status: result.status, receiptId: result.receiptId, externalId: result.externalId }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
