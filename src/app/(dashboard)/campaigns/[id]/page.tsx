import Link from "next/link";
import { notFound } from "next/navigation";

import { buildInitialCampaignChecklist, type CampaignChecklist } from "@/lib/campaigns/offer-campaigns";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CampaignChecklistClient } from "./CampaignChecklistClient";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolved = await params;
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) notFound();

  const { data: campaign, error } = await supabase
    .from("offer_campaigns")
    .select("id,status,started_at,ends_at,channel_checklist,offers(id,product_name,platform,current_price,image_url)")
    .eq("id", resolved.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error || !campaign) notFound();

  const offer = Array.isArray(campaign.offers) ? campaign.offers[0] : campaign.offers;
  const checklist = (campaign.channel_checklist ?? buildInitialCampaignChecklist()) as CampaignChecklist;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Campanha ativa</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{offer?.product_name ?? "Campanha da oferta"}</h1>
          <p className="mt-2 text-sm text-white/45">{offer?.platform ?? "Marketplace"} · status {campaign.status}</p>
        </div>
        <Link href="/videos" className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.08]">
          Voltar para Vídeos
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Produto</p>
          <div className="mt-3 flex items-center gap-3">
            {offer?.image_url ? <img src={`/api/images/proxy?url=${encodeURIComponent(offer.image_url)}`} alt="" className="h-16 w-16 rounded-lg object-contain" /> : null}
            <div>
              <p className="text-sm font-semibold text-white">{offer?.product_name ?? "Oferta"}</p>
              <p className="mt-1 text-xs text-emerald-300">R$ {Number(offer?.current_price ?? 0).toFixed(2).replace(".", ",")}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Início</p>
          <p className="mt-3 text-sm font-semibold text-white">{formatDate(campaign.started_at)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Fim da janela inicial</p>
          <p className="mt-3 text-sm font-semibold text-white">{formatDate(campaign.ends_at)}</p>
        </div>
      </section>

      <CampaignChecklistClient campaignId={campaign.id} initialChecklist={checklist} campaignStatus={campaign.status} />
    </div>
  );
}
