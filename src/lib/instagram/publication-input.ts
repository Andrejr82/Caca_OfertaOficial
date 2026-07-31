type PublicationClient = {
  from: (table: string) => any;
};

import { evaluateInstagramSafety, instagramVideoFingerprint } from "@/lib/instagram/safety";

export async function resolveInstagramVideoJobInput(client: PublicationClient, userId: string, videoJobId: string) {
  const { data: job } = await client.from("video_jobs").select("id,offer_id,status,video_url").eq("id", videoJobId).eq("user_id", userId).maybeSingle();
  if (!job || job.status !== "approved" || !job.video_url) return { ok: false as const, status: 409, message: "O vídeo precisa estar aprovado e pronto para publicação." };
  const { data: draft } = await client.from("posts").select("id,offer_id").eq("offer_id", job.offer_id).eq("user_id", userId).eq("channel", "instagram").eq("status", "draft").maybeSingle();
  if (!draft) return { ok: false as const, status: 404, message: "Nenhum draft do Instagram foi encontrado para esta oferta." };
  return { ok: true as const, postId: draft.id, offerId: job.offer_id, videoUrl: job.video_url };
}

export async function loadInstagramPublicationContext(client: PublicationClient, userId: string, postId: string, mediaType: "FEED" | "REELS", videoUrl?: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRows, error: recentError } = await client.from("posts").select("content,posted_at").eq("user_id", userId).eq("channel", "instagram").eq("status", "published").gte("posted_at", since).order("posted_at", { ascending: false }).limit(20);
  if (recentError) return { ok: false as const, status: 503, message: "Não foi possível validar a janela de segurança do Instagram." };
  if (mediaType === "REELS") {
    const { data: receipts, error: receiptsError } = await client.from("app_settings").select("value").eq("user_id", userId).like("key", "pmav5.publication.receipt.%").limit(100);
    if (receiptsError) return { ok: false as const, status: 503, message: "Não foi possível validar duplicidade do Reel." };
    const fingerprint = instagramVideoFingerprint(videoUrl || "");
    const duplicate = (receipts ?? []).some((row: any) => row.value?.metadata?.instagramVideoFingerprint === fingerprint);
    if (duplicate) return { ok: false as const, status: 409, code: "INSTAGRAM_DUPLICATE_VIDEO", message: "Este vídeo já foi publicado no Instagram." };
  }
  const { data: draft, error: draftError } = await client.from("posts").select("content").eq("id", postId).eq("user_id", userId).eq("channel", "instagram").eq("status", "draft").maybeSingle();
  if (draftError || !draft) return { ok: false as const, status: 404, message: "Draft do Instagram não encontrado." };
  const safety = evaluateInstagramSafety({
    caption: draft.content || "",
    publishedAt: (recentRows ?? []).map((row: any) => row.posted_at).filter(Boolean),
    recentCaptions: (recentRows ?? []).map((row: any) => row.content).filter(Boolean)
  });
  if (!safety.ok) return { ok: false as const, status: 429, code: safety.code, message: safety.message };
  return { ok: true as const };
}
