"use client";

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  CAMPAIGN_CHANNELS,
  buildCampaignTrackingKey,
  normalizeCampaignMarketplace,
  trackingTypeForMarketplace,
  type CampaignChannel,
  type CampaignOfficialLinks,
} from "@/lib/campaigns/offer-campaigns";

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  instagram_reel: "Instagram Reel",
  instagram_story: "Instagram Stories",
  facebook_feed: "Facebook Feed",
  facebook_group: "Facebook Groups",
  whatsapp: "WhatsApp",
};

export function CampaignLinksClient({
  campaignId,
  platform,
  initialLinks,
}: {
  campaignId: string;
  platform: string;
  initialLinks: CampaignOfficialLinks;
}) {
  const [links, setLinks] = useState(initialLinks ?? {});
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(
    CAMPAIGN_CHANNELS.map((channel) => [channel, initialLinks?.[channel]?.official_url ?? ""]),
  ));
  const [busyChannel, setBusyChannel] = useState<CampaignChannel | null>(null);
  const [copied, setCopied] = useState<CampaignChannel | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const marketplace = useMemo(() => {
    try { return normalizeCampaignMarketplace(platform); } catch { return null; }
  }, [platform]);

  if (!marketplace) return null;
  const trackingType = trackingTypeForMarketplace(marketplace);
  const trackingLabel = trackingType === "sub_id" ? "Sub_id" : "Etiqueta";

  async function copyTrackingKey(channel: CampaignChannel) {
    await navigator.clipboard.writeText(buildCampaignTrackingKey(campaignId, channel));
    setCopied(channel);
    window.setTimeout(() => setCopied(null), 1500);
  }

  async function save(channel: CampaignChannel) {
    setBusyChannel(channel);
    setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, officialUrl: drafts[channel] ?? "" }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ text: data.error ?? "Não foi possível salvar o link oficial.", error: true });
        return;
      }
      setLinks(data.officialLinks ?? {});
      setMessage({ text: `Link oficial de ${CHANNEL_LABELS[channel]} salvo.` });
    } catch {
      setMessage({ text: "Não foi possível salvar o link oficial.", error: true });
    } finally {
      setBusyChannel(null);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5">
      <div className="mb-4">
        <h2 className="font-bold text-white">Links oficiais por canal</h2>
        <p className="mt-1 text-xs text-white/45">
          Gere o link no programa oficial do {marketplace} usando o {trackingLabel} sugerido e cole o link aqui. O sistema não fabrica shortlinks.
        </p>
      </div>

      <div className="space-y-3">
        {CAMPAIGN_CHANNELS.map((channel) => {
          const trackingKey = buildCampaignTrackingKey(campaignId, channel);
          const saved = links[channel];
          return (
            <div key={channel} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{CHANNEL_LABELS[channel]}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/45">
                    <span>{trackingLabel}: <code className="text-sky-200">{trackingKey}</code></span>
                    <button type="button" onClick={() => copyTrackingKey(channel)} className="inline-flex items-center gap-1 text-sky-200 hover:text-sky-100">
                      {copied === channel ? <Check size={12} /> : <Copy size={12} />}
                      {copied === channel ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
                {saved?.official_url ? (
                  <a href={saved.official_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                    <ExternalLink size={12} /> Link salvo
                  </a>
                ) : null}
              </div>

              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                <input
                  type="url"
                  value={drafts[channel] ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [channel]: event.target.value }))}
                  placeholder={marketplace === "Shopee" ? "https://s.shopee.com.br/..." : "Link oficial do Mercado Livre"}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07101a] px-3 py-2 text-xs text-white outline-none focus:border-sky-400/50"
                />
                <button
                  type="button"
                  onClick={() => save(channel)}
                  disabled={busyChannel !== null || !(drafts[channel] ?? "").trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
                >
                  {busyChannel === channel ? <Loader2 size={13} className="animate-spin" /> : null}
                  Salvar link
                </button>
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
  );
}
