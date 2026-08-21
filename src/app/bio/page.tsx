import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { officialBrand } from "@/lib/env";

export const dynamic = "force-dynamic";

type BioItem = {
  id: string;
  offerId: string;
  userId: string;
  publishedAt: string | null;
  productName: string;
  imageUrl: string;
  currentPrice: number;
  oldPrice: number | null;
  trackedUrl: string;
};

type StoryReceiptValue = {
  offerId?: string;
  affiliateLinkId?: string;
  channel?: string;
  status?: string;
  publishedAt?: string;
};

function dedupeByOffer(items: BioItem[]) {
  const ordered = [...items].sort((a, b) => {
    const right = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    const left = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    return right - left;
  });
  const seen = new Set<string>();
  return ordered.filter((item) => {
    if (seen.has(item.offerId)) return false;
    seen.add(item.offerId);
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
  let items: BioItem[] = [];

  if (supabase) {
    let feedQuery = supabase
      .from("posts")
      .select("id,offer_id,user_id,posted_at,offers(product_name,image_url,current_price,old_price),affiliate_links(tracked_url)")
      .eq("channel", "instagram")
      .eq("status", "published")
      .not("affiliate_link_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(200);

    let receiptQuery = supabase
      .from("app_settings")
      .select("user_id,key,value,updated_at")
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

    const feedItems: BioItem[] = [];
    if (!feedError && feedData) {
      for (const row of feedData as any[]) {
        const offer = Array.isArray(row.offers) ? row.offers[0] : row.offers;
        const affiliate = Array.isArray(row.affiliate_links) ? row.affiliate_links[0] : row.affiliate_links;
        if (!offer?.product_name || !offer?.image_url || !affiliate?.tracked_url) continue;
        feedItems.push({
          id: row.id,
          offerId: row.offer_id,
          userId: row.user_id,
          publishedAt: row.posted_at,
          productName: offer.product_name,
          imageUrl: offer.image_url,
          currentPrice: Number(offer.current_price),
          oldPrice: offer.old_price == null ? null : Number(offer.old_price),
          trackedUrl: affiliate.tracked_url,
        });
      }
    }

    const receipts: Array<{ userId: string; offerId: string; affiliateLinkId: string; publishedAt: string }> = [];
    if (!receiptError && receiptData) {
      for (const row of receiptData as any[]) {
        const value = (row.value ?? {}) as StoryReceiptValue;
        if (value.channel !== "instagram" || value.status !== "published") continue;
        if (!value.offerId || !value.affiliateLinkId || !value.publishedAt) continue;
        receipts.push({ userId: row.user_id, offerId: value.offerId, affiliateLinkId: value.affiliateLinkId, publishedAt: value.publishedAt });
      }
    }

    const storyItems: BioItem[] = [];
    if (receipts.length) {
      const offerIds = [...new Set(receipts.map((receipt) => receipt.offerId))];
      const linkIds = [...new Set(receipts.map((receipt) => receipt.affiliateLinkId))];
      const [{ data: offers }, { data: links }] = await Promise.all([
        supabase.from("offers").select("id,user_id,product_name,image_url,current_price,old_price").in("id", offerIds),
        supabase.from("affiliate_links").select("id,user_id,offer_id,tracked_url").in("id", linkIds),
      ]);
      const offerById = new Map((offers ?? []).map((offer: any) => [offer.id, offer]));
      const linkById = new Map((links ?? []).map((link: any) => [link.id, link]));
      for (const receipt of receipts) {
        const offer: any = offerById.get(receipt.offerId);
        const link: any = linkById.get(receipt.affiliateLinkId);
        if (!offer || !link || offer.user_id !== receipt.userId || link.user_id !== receipt.userId || link.offer_id !== receipt.offerId) continue;
        if (!offer.product_name || !offer.image_url || !link.tracked_url) continue;
        storyItems.push({
          id: `story:${receipt.offerId}:${receipt.publishedAt}`,
          offerId: receipt.offerId,
          userId: receipt.userId,
          publishedAt: receipt.publishedAt,
          productName: offer.product_name,
          imageUrl: offer.image_url,
          currentPrice: Number(offer.current_price),
          oldPrice: offer.old_price == null ? null : Number(offer.old_price),
          trackedUrl: link.tracked_url,
        });
      }
    }

    items = dedupeByOffer([...feedItems, ...storyItems]);
  }

  return (
    <div className="min-h-screen bg-paper text-ink pb-12 font-sans">
      <header className="pt-12 pb-8 px-4 text-center max-w-2xl mx-auto flex flex-col items-center">
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-moss shadow-glow mb-4 bg-surface flex items-center justify-center">
          <span className="text-3xl">🛒</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">{officialBrand.appName}</h1>
        <p className="text-sm text-gray-400 mb-6">Encontre aqui as ofertas e achadinhos publicados no nosso Instagram, incluindo os Stories mais recentes.</p>
        <div className="flex items-center justify-center gap-5 mb-4">
          <Link href={`https://instagram.com/${officialBrand.instagram}`} target="_blank" className="hover:scale-110 transition-transform" title="Instagram"><img src="/icons/instagram.svg" alt="Instagram" className="w-9 h-9" /></Link>
          {officialBrand.telegramUrl && <Link href={officialBrand.telegramUrl} target="_blank" className="hover:scale-110 transition-transform" title="Telegram"><img src="/icons/telegram.svg" alt="Telegram" className="w-9 h-9" /></Link>}
          {officialBrand.whatsappUrl && <Link href={officialBrand.whatsappUrl} target="_blank" className="hover:scale-110 transition-transform" title="WhatsApp"><img src="/icons/whatsapp.svg" alt="WhatsApp" className="w-9 h-9" /></Link>}
        </div>
      </header>

      <main className="px-4 max-w-5xl mx-auto">
        {items.length === 0 ? <div className="text-center text-gray-500 py-12"><p>Nenhuma oferta encontrada no momento.</p></div> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <Link key={item.id} href={item.trackedUrl} target="_blank" rel="noopener noreferrer" className="group flex flex-col bg-surface border border-border-glass rounded-2xl overflow-hidden hover:shadow-card-hover hover:border-moss/30 transition-all duration-300">
                <div className="relative w-full aspect-square bg-white flex items-center justify-center p-4">
                  <img src={item.imageUrl} alt={item.productName} className="object-cover w-full h-full transform group-hover:scale-105 transition-transform duration-500" loading="lazy" referrerPolicy="no-referrer" />
                  {item.oldPrice && item.oldPrice > item.currentPrice && <div className="absolute top-3 right-3 bg-clay text-white text-xs font-bold px-2 py-1 rounded-md shadow-lg">{Math.floor(((item.oldPrice - item.currentPrice) / item.oldPrice) * 100)}% OFF</div>}
                </div>
                <div className="p-5 flex flex-col flex-grow">
                  <h2 className="text-sm font-medium text-gray-200 line-clamp-2 mb-3 flex-grow">{item.productName}</h2>
                  <div className="flex flex-col gap-1 mb-4">
                    {item.oldPrice && item.oldPrice > item.currentPrice && <span className="text-xs text-gray-500 line-through">R$ {item.oldPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                    <span className="text-lg font-bold text-moss">R$ {item.currentPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <span className="w-full text-center bg-moss/10 group-hover:bg-moss text-moss group-hover:text-white border border-moss/50 font-semibold py-2.5 rounded-xl transition-colors duration-300">Pegar Oferta</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
