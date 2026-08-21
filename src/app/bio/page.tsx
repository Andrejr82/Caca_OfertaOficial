import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { officialBrand } from "@/lib/env";

export const dynamic = "force-dynamic";

type BioPost = {
  id: string;
  offer_id: string;
  user_id: string;
  posted_at: string | null;
  offers: {
    product_name: string;
    image_url: string;
    current_price: number;
    old_price: number | null;
  } | null;
  affiliate_links: {
    tracked_url: string;
  } | { tracked_url: string }[] | null;
};

type StoryReceiptValue = {
  postId?: string;
  offerId?: string;
  channel?: string;
  publishedAt?: string;
};

function affiliateUrl(post: BioPost) {
  const relation = post.affiliate_links;
  const link = Array.isArray(relation) ? relation[0] : relation;
  return link?.tracked_url || "#";
}

function dedupeByOffer(posts: BioPost[]) {
  const ordered = [...posts].sort((a, b) => {
    const right = b.posted_at ? Date.parse(b.posted_at) : 0;
    const left = a.posted_at ? Date.parse(a.posted_at) : 0;
    return right - left;
  });
  const seen = new Set<string>();
  return ordered.filter((post) => {
    const key = post.offer_id || post.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200);
}

export default async function BioPage({
  searchParams
}: {
  searchParams: Promise<{ userId?: string; user_id?: string }>;
}) {
  const params = await searchParams;
  const targetUserId = params.userId || params.user_id;

  const supabase = createSupabaseAdminClient();
  let posts: BioPost[] = [];

  if (supabase) {
    const baseSelect = `
      id,
      offer_id,
      user_id,
      posted_at,
      offers (
        product_name,
        image_url,
        current_price,
        old_price
      ),
      affiliate_links (
        tracked_url
      )
    `;

    let feedQuery = supabase
      .from("posts")
      .select(baseSelect)
      .eq("channel", "instagram")
      .eq("status", "published")
      .not("affiliate_link_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(200);

    let receiptQuery = supabase
      .from("app_settings")
      .select("user_id,key,value")
      .like("key", "stories.publication.receipt.instagram.%")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (targetUserId) {
      feedQuery = feedQuery.eq("user_id", targetUserId);
      receiptQuery = receiptQuery.eq("user_id", targetUserId);
    }

    const [{ data: feedData, error: feedError }, { data: receiptData, error: receiptError }] = await Promise.all([
      feedQuery,
      receiptQuery,
    ]);

    const feedPosts = !feedError && feedData ? feedData as unknown as BioPost[] : [];
    const receiptMap = new Map<string, { userId: string; publishedAt: string }>();

    if (!receiptError && receiptData) {
      for (const row of receiptData) {
        const value = (row.value ?? {}) as StoryReceiptValue;
        const postId = typeof value.postId === "string" ? value.postId : "";
        const publishedAt = typeof value.publishedAt === "string" ? value.publishedAt : "";
        if (!postId || !publishedAt || value.channel !== "instagram") continue;
        receiptMap.set(postId, { userId: row.user_id, publishedAt });
      }
    }

    let storyPosts: BioPost[] = [];
    const storyPostIds = [...receiptMap.keys()];
    if (storyPostIds.length) {
      let storyQuery = supabase
        .from("posts")
        .select(baseSelect)
        .in("id", storyPostIds)
        .eq("channel", "instagram")
        .not("affiliate_link_id", "is", null)
        .limit(200);
      if (targetUserId) storyQuery = storyQuery.eq("user_id", targetUserId);

      const { data: storyData, error: storyError } = await storyQuery;
      if (!storyError && storyData) {
        storyPosts = (storyData as unknown as BioPost[])
          .map((post) => {
            const receipt = receiptMap.get(post.id);
            return receipt ? { ...post, posted_at: receipt.publishedAt } : post;
          });
      }
    }

    posts = dedupeByOffer([...feedPosts, ...storyPosts]);
  }

  return (
    <div className="min-h-screen bg-paper text-ink pb-12 font-sans">
      <header className="pt-12 pb-8 px-4 text-center max-w-2xl mx-auto flex flex-col items-center">
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-moss shadow-glow mb-4 bg-surface flex items-center justify-center">
          <span className="text-3xl">🛒</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          {officialBrand.appName}
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          Encontre aqui as ofertas e achadinhos publicados no nosso Instagram, incluindo os Stories mais recentes.
        </p>

        <div className="flex items-center justify-center gap-5 mb-4">
          <Link href={`https://instagram.com/${officialBrand.instagram}`} target="_blank" className="hover:scale-110 transition-transform" title="Instagram">
            <img src="/icons/instagram.svg" alt="Instagram" className="w-9 h-9" />
          </Link>
          {officialBrand.telegramUrl && (
            <Link href={officialBrand.telegramUrl} target="_blank" className="hover:scale-110 transition-transform" title="Telegram">
              <img src="/icons/telegram.svg" alt="Telegram" className="w-9 h-9" />
            </Link>
          )}
          {officialBrand.whatsappUrl && (
            <Link href={officialBrand.whatsappUrl} target="_blank" className="hover:scale-110 transition-transform" title="WhatsApp">
              <img src="/icons/whatsapp.svg" alt="WhatsApp" className="w-9 h-9" />
            </Link>
          )}
        </div>
      </header>

      <main className="px-4 max-w-5xl mx-auto">
        {posts.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p>Nenhuma oferta encontrada no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => {
              const offer = post.offers;
              const link = affiliateUrl(post);
              if (!offer) return null;

              return (
                <Link
                  key={post.id}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col bg-surface border border-border-glass rounded-2xl overflow-hidden hover:shadow-card-hover hover:border-moss/30 transition-all duration-300"
                >
                  <div className="relative w-full aspect-square bg-white flex items-center justify-center p-4">
                    {offer.image_url ? (
                      <img
                        src={offer.image_url}
                        alt={offer.product_name}
                        className="object-cover w-full h-full transform group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full bg-gray-100">
                        <span className="text-gray-300">Sem Imagem</span>
                      </div>
                    )}

                    {offer.old_price && offer.old_price > offer.current_price && (
                      <div className="absolute top-3 right-3 bg-clay text-white text-xs font-bold px-2 py-1 rounded-md shadow-lg">
                        {Math.floor(((offer.old_price - offer.current_price) / offer.old_price) * 100)}% OFF
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex flex-col flex-grow">
                    <h2 className="text-sm font-medium text-gray-200 line-clamp-2 mb-3 flex-grow">
                      {offer.product_name}
                    </h2>

                    <div className="flex flex-col gap-1 mb-4">
                      {offer.old_price && offer.old_price > offer.current_price && (
                        <span className="text-xs text-gray-500 line-through">
                          R$ {offer.old_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      <span className="text-lg font-bold text-moss">
                        R$ {offer.current_price?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <span className="w-full text-center bg-moss/10 group-hover:bg-moss text-moss group-hover:text-white border border-moss/50 font-semibold py-2.5 rounded-xl transition-colors duration-300">
                      Pegar Oferta
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
