import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { officialBrand, hasTelegramEnv } from "@/lib/env";
import { getPostHistory } from "@/lib/offers/queries";
import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";
import { Bot, AlertTriangle } from "lucide-react";
import { selectEditorialTop30 } from "@/lib/offers/commercial-channel-router";
import { getTodayBrtStart } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";
import { mergePanelDrafts } from "@/lib/offers/panel-draft-selection";
import type { Offer } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function TelegramDashboardPage() {
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
  const configured = hasTelegramEnv();
  
  interface PostWithOffer {
    id: string;
    content: string;
    status: string;
    external_id: string | null;
    posted_at: string | null;
    created_at: string;
    affiliate_links?: {
      tracked_url: string;
    } | null;
    offers: {
      id: string;
      product_name: string;
      platform: string;
      marketplace?: string | null;
      category?: string | null;
      current_price: number;
      old_price: number | null;
      image_url: string | null;
      original_url: string;
      coupon: string | null;
      notes: string | null;
      explainability?: Record<string, unknown> | null;
    };
  }

  let draftPosts: PostWithOffer[] = [];

  if (supabase) {
    const { data: drafts } = await supabase
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("channel", "telegram")
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    const rawDrafts = drafts || [];
    const editorialOffers = rawDrafts
      .map((post) => post.offers as Offer | null)
      .filter((offer): offer is Offer => Boolean(offer));
    const editorialOfferIds = new Set(selectEditorialTop30(editorialOffers).map((offer) => offer.id));
    draftPosts = mergePanelDrafts(rawDrafts as any, editorialOfferIds, getTodayBrtStart()) as unknown as PostWithOffer[];
  }

  const historyData = await getPostHistory("telegram");
  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-sky-500/20">
          <Bot size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Telegram</h1>
          <p className="text-xs text-white/35">{officialBrand.telegramName} - Aprovação de mensagens e histórico de envios.</p>
        </div>
      </header>

      {!configured && (
        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-4 flex items-center gap-3 text-yellow-500">
          <AlertTriangle size={20} />
          <p className="text-sm">O bot do Telegram não está configurado. Cadastre os tokens nas configurações para permitir o envio real.</p>
        </div>
      )}

      <SocialChannelPostsView
        channel="telegram"
        accentClassName="bg-sky-500/15 text-sky-300"
        draftPosts={draftPosts}
        historyData={historyData as any}
      />
    </div>
  );
}
