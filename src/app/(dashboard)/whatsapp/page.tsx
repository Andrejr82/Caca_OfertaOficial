import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { officialBrand } from "@/lib/env";
import { getPostHistory } from "@/lib/offers/queries";
import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";
import { MessageCircle } from "lucide-react";
import { WhatsappTop30Action } from "@/components/whatsapp/whatsapp-top30-action";
import { getTodayBrtStart, prepareTop30WhatsappLegacyDrafts, SupabaseTop30WhatsappRepository } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";
import { mergePanelDrafts } from "@/lib/offers/panel-draft-selection";

export const dynamic = "force-dynamic";

export default async function WhatsappDashboardPage() {
  const authClient = await createServerSupabaseClient();
  const supabase = createSupabaseAdminClient() || authClient;
  const { data: { user } } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  
  interface PostWithOffer {
    id: string;
    content: string;
    status: string;
    external_id: string | null;
    posted_at: string | null;
    created_at: string;
    deleted_at?: string | null;
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
      status: string;
      created_at: string;
      explainability?: Record<string, unknown> | null;
    };
  }

  let draftPosts: PostWithOffer[] = [];

  let selectedOfferIds = new Set<string>();
  if (supabase && user?.id) {
    try {
      const top30 = await prepareTop30WhatsappLegacyDrafts(new SupabaseTop30WhatsappRepository(supabase, user.id));
      selectedOfferIds = new Set(top30.selectedOfferIds);
    } catch {
      // Fail closed: a preparation read failure must not render the raw draft cohort.
      selectedOfferIds = new Set();
    }
  }

  if (supabase) {
    const todayStart = getTodayBrtStart();
    const { data: drafts } = await supabase
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("channel", "whatsapp")
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    draftPosts = mergePanelDrafts(drafts || [], selectedOfferIds, todayStart);
  }

  const historyData = await getPostHistory("whatsapp");
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
        <WhatsappTop30Action />
      </header>

      <SocialChannelPostsView
        channel="whatsapp"
        accentClassName="bg-emerald-500/15 text-emerald-300"
        draftPosts={draftPosts}
        historyData={historyData as any}
      />
    </div>
  );
}
