import { publishOfficialPost, type OfficialPublicationChannel, type OfficialPublicationCommand } from "../src/core/publication";
import { createOfficialPublicationServiceDependencies, publicationIdempotencyKey, publicationPayloadReference } from "../src/lib/publication/official/create-official-publication-service";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

async function run() {
  const tenantId = process.env.TENANT_ID || "";
  const offerId = process.env.OFFER_ID || "";
  const postId = process.env.POST_ID || "";
  const channel = (process.env.CHANNEL || "whatsapp") as OfficialPublicationChannel;
  const commandId = process.env.COMMAND_ID || `admin:${postId}:${channel}`;
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("Official publication dependencies are unavailable");
  const command: OfficialPublicationCommand = {
    contractVersion: "pmav5.publication/v1", commandId,
    idempotencyKey: publicationIdempotencyKey(postId, channel), correlationId: commandId, causationId: null,
    offerId, postId, tenantId, channel, expectedOfferState: "approved", expectedOfferVersion: 2,
    expectedPostState: "draft", expectedPostVersion: 0, payloadReference: publicationPayloadReference(postId),
    requestedAt: new Date().toISOString(), actor: { type: "service", id: "admin-script", service: "publish-direct" },
    origin: "scripts.publish-direct", reason: { code: "PUBLISH_OFFICIAL_POST" },
    metadata: channel === "instagram" ? { instagramMode: "synchronous" } : undefined
  };
  const result = await publishOfficialPost(command, createOfficialPublicationServiceDependencies(client, tenantId));
  if (result.status !== "published") throw new Error(`${result.code}: ${result.message}`);
  console.log(JSON.stringify({ status: result.status, receiptId: result.receiptId }));
}

run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
