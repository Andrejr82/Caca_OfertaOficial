import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildImportedDrafts, type ImportedDraftChannel } from "@/lib/videos/import/drafts";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const { data: job, error: jobError } = await client.from("video_jobs").select("id,offer_id,status,template_id,metadata").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (jobError || !job) return NextResponse.json({ ok: false, error: "Job não encontrado." }, { status: 404 });
  if (job.template_id !== "imported-video-v1" || !["ready", "approved"].includes(job.status)) return NextResponse.json({ ok: false, error: "Vídeo ainda não está pronto para gerar drafts." }, { status: 409 });

  const { data: offer, error: offerError } = await client.from("offers").select("*").eq("id", job.offer_id).eq("user_id", user.id).maybeSingle();
  if (offerError || !offer) return NextResponse.json({ ok: false, error: "Oferta não encontrada." }, { status: 404 });
  const { data: links, error: linksError } = await client.from("affiliate_links").select("id,channel,tracked_url").eq("offer_id", job.offer_id).eq("user_id", user.id).in("channel", ["instagram", "facebook"]);
  if (linksError) return NextResponse.json({ ok: false, error: "Não foi possível carregar os links monetizados." }, { status: 503 });

  const channels = (((job.metadata as Record<string, unknown> | null)?.importedVideo as Record<string, unknown> | undefined)?.channels ?? ["instagram", "facebook"]) as ImportedDraftChannel[];
  let drafts;
  try {
    drafts = buildImportedDrafts({ ...offer, affiliate_links: links ?? [] }, channels);
  } catch (error) {
    const code = error instanceof Error ? error.message : "NO_MONETIZED_LINK";
    return NextResponse.json({ ok: false, code, error: code === "NO_MONETIZED_LINK" ? "Link monetizado ausente." : "Não foi possível gerar os drafts." }, { status: 409 });
  }

  const persisted: Array<{ id?: string; channel?: string; content?: string; status?: string } | null> = [];
  for (const draft of drafts) {
    const affiliateLink = (links ?? []).find((link) => link.channel === draft.channel);
    const { data: existing } = await client.from("posts").select("id").eq("offer_id", job.offer_id).eq("user_id", user.id).eq("channel", draft.channel).eq("status", "draft").maybeSingle();
    if (existing) {
      const { data } = await client.from("posts").update({ content: draft.content, affiliate_link_id: affiliateLink?.id ?? null }).eq("id", existing.id).eq("user_id", user.id).select("id,channel,content,status").maybeSingle();
      persisted.push(data ?? { id: existing.id, channel: draft.channel, content: draft.content, status: "draft" });
    } else {
      const { data, error } = await client.from("posts").insert({ user_id: user.id, offer_id: job.offer_id, affiliate_link_id: affiliateLink?.id ?? null, channel: draft.channel, content: draft.content, status: "draft" }).select("id,channel,content,status").maybeSingle();
      if (error) return NextResponse.json({ ok: false, error: "Não foi possível persistir o draft." }, { status: 503 });
      persisted.push(data);
    }
  }

  const metadata = (job.metadata as Record<string, unknown> | null) ?? {};
  const importedVideo = (metadata.importedVideo as Record<string, unknown> | undefined) ?? {};
  await client.from("video_jobs").update({ stage: "ready_for_review", metadata: { ...metadata, importedVideo: { ...importedVideo, drafts: drafts.map(({ channel, trackedUrl, content }) => ({ channel, trackedUrl, content, postId: persisted.find((post) => post?.channel === channel)?.id ?? null })) } } }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true, drafts: persisted });
}
