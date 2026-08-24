import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { officialBrand } from "@/lib/env";
import { getPostHistory } from "@/lib/offers/queries";
import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";
import { MessageCircle } from "lucide-react";
import { WhatsappTop30Action } from "@/components/whatsapp/whatsapp-top30-action";
import { prepareTop30WhatsappLegacyDrafts, SupabaseTop30WhatsappRepository } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";
import { loadWhatsappDashboardDrafts, type PostWithOffer } from "@/lib/offers/whatsapp-dashboard-loader";

export const dynamic = "force-dynamic";

export default async function WhatsappDashboardPage() {
  const authClient = await createServerSupabaseClient();
  const supabase = createSupabaseAdminClient() || authClient;
  const { data: { user } } = authClient ? await authClient.auth.getUser() : { data: { user: null } };

  async function fetchDraftPosts(): Promise<PostWithOffer[]> {
    if (!supabase || !user?.id) return [];
    let selectedOfferIds = new Set<string>();
    try {
      const top30 = await prepareTop30WhatsappLegacyDrafts(new SupabaseTop30WhatsappRepository(supabase, user.id));
      selectedOfferIds = new Set(top30.selectedOfferIds);
    } catch {
      // Fail closed: a preparation read failure must not render the raw draft cohort.
      selectedOfferIds = new Set();
    }

    return loadWhatsappDashboardDrafts({
      supabase,
      userId: user.id,
      selectedOfferIds,
      limit: 30,
    });
  }

  // Execução em paralelo das consultas independentes (drafts operacionais + histórico recente)
  const [draftPosts, historyData] = await Promise.all([
    fetchDraftPosts(),
    getPostHistory("whatsapp", { limit: 50 }),
  ]);

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
