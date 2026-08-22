"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  nextCampaignAction,
  type CampaignChannel,
  type CampaignChannelState,
  type CampaignChecklist,
} from "@/lib/campaigns/offer-campaigns";

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  instagram_reel: "Instagram Reel",
  instagram_story: "Instagram Stories",
  facebook_feed: "Facebook Feed",
  facebook_group: "Facebook Groups",
  whatsapp: "WhatsApp",
};

const STATUS_LABELS: Record<CampaignChannelState, string> = {
  pending: "Pendente",
  ready: "Pronto",
  published: "Publicado",
  skipped: "Ignorado",
};

const CHANNEL_ORDER: CampaignChannel[] = ["instagram_reel", "instagram_story", "facebook_feed", "facebook_group", "whatsapp"];

export function CampaignChecklistClient({
  campaignId,
  initialChecklist,
  campaignStatus,
}: {
  campaignId: string;
  initialChecklist: CampaignChecklist;
  campaignStatus: string;
}) {
  const [checklist, setChecklist] = useState(initialChecklist);
  const [busyChannel, setBusyChannel] = useState<CampaignChannel | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const nextAction = useMemo(() => nextCampaignAction(checklist), [checklist]);
  const locked = campaignStatus === "completed" || campaignStatus === "cancelled";

  async function update(channel: CampaignChannel, status: CampaignChannelState) {
    setBusyChannel(channel);
    setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/channel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, status }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ text: data.error ?? "Não foi possível atualizar o canal.", error: true });
        return;
      }
      setChecklist(data.channelChecklist);
    } catch {
      setMessage({ text: "Não foi possível atualizar o canal.", error: true });
    } finally {
      setBusyChannel(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Próxima ação</p>
        <p className="mt-2 text-lg font-bold text-white">{nextAction.label}</p>
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
        <div className="mb-4">
          <h2 className="font-bold text-white">Checklist de distribuição</h2>
          <p className="mt-1 text-xs text-white/40">Marque o avanço da mesma oferta em cada canal.</p>
        </div>

        <div className="space-y-3">
          {CHANNEL_ORDER.map((channel) => {
            const item = checklist[channel];
            return (
              <div key={channel} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {item.status === "published" ? <CheckCircle2 size={18} className="text-emerald-300" /> : <Circle size={18} className="text-white/30" />}
                    <div>
                      <p className="text-sm font-semibold text-white">{CHANNEL_LABELS[channel]}</p>
                      <p className="mt-1 text-xs text-white/40">{STATUS_LABELS[item.status]}{item.published_at ? ` · ${new Date(item.published_at).toLocaleString("pt-BR")}` : ""}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(["pending", "ready", "published", "skipped"] as CampaignChannelState[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => update(channel, status)}
                        disabled={locked || busyChannel !== null || item.status === status}
                        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-white/70 hover:bg-white/[0.08] disabled:opacity-35"
                      >
                        {busyChannel === channel && item.status !== status ? <Loader2 size={12} className="inline animate-spin" /> : STATUS_LABELS[status]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {message && (
          <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${message.error ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}
