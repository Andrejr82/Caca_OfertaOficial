import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { officialBrand } from "@/lib/env";
import { getPostHistory } from "@/lib/offers/queries";
import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";
import { MessageCircle } from "lucide-react";
import { listOffersWithDraftStatus } from "@/lib/offers/queries";
import { buildCommercialQueue } from "@/lib/offers/commercial-curation-queue";
import { routeCommercialCandidates } from "@/lib/offers/commercial-channel-router";
import { CommercialChannelQueue } from "@/components/offers/commercial-channel-queue";

export const dynamic = "force-dynamic";

export default async function WhatsappDashboardPage() {
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
  
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
    };
  }

  let draftPosts: PostWithOffer[] = [];

  if (supabase) {
    const { data: drafts } = await supabase
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("channel", "whatsapp")
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    draftPosts = drafts || [];
  }

  const historyData = await getPostHistory("whatsapp");
  const routedCandidates = routeCommercialCandidates(buildCommercialQueue(await listOffersWithDraftStatus()));

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg shadow-emerald-500/20">
          <MessageCircle size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">WhatsApp</h1>
          <p className="text-xs text-white/35">{officialBrand.whatsappName} - Aprovação de envios e histórico de grupos/canais.</p>
        </div>
      </header>

      <CommercialChannelQueue candidates={routedCandidates} targetQueue="manual_whatsapp" title="Fila Comercial · WhatsApp manual" />

      <SocialChannelPostsView
        channel="whatsapp"
        accentClassName="bg-emerald-500/15 text-emerald-300"
        draftPosts={draftPosts}
        historyData={historyData as any}
      />
    </div>
  );
}
