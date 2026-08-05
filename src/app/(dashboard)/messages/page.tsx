import Link from "next/link";
import { generateAllMessages } from "@/lib/messages/generate";
import { getOfferPosts, listAffiliateLinks, listOffers } from "@/lib/offers/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GenerateAIMessagesButton, CopyToClipboardButton } from "@/components/messages/message-actions";
import { Badge } from "@/components/ui/badge";

export default async function MessagesPage(props: { searchParams: Promise<{ offerId?: string }> }) {
  const searchParams = await props.searchParams;
  const offers = await listOffers();
  const links = await listAffiliateLinks();

  // Seleciona a oferta ativa
  const selectedOfferId = searchParams.offerId;
  const offer = offers.find((o) => o.id === selectedOfferId) || offers[0];

  // A variável 'link' fixa foi substituída pela filtragem offerLinks.
  // Busca se já existem posts gerados pela IA no banco de dados para esta oferta
  let messages: { telegram: string; instagramFeed: string; whatsapp: string } | null = null;
  let isAIGenerated = false;

  const supabase = await createServerSupabaseClient();
  if (supabase && offer) {
    const dbPosts = await getOfferPosts(offer.id);

    if (dbPosts && dbPosts.length > 0) {
      const tel = dbPosts.find((p) => p.channel === "telegram");
      const inst = dbPosts.find((p) => p.channel === "instagram");
      const wa = dbPosts.find((p) => p.channel === "whatsapp");

      messages = {
        telegram: tel?.content || "",
        instagramFeed: inst?.content || "",
        whatsapp: wa?.content || ""
      };
      isAIGenerated = true;
    }
  }

  // Fallback para o gerador de template clássico se não houver posts no banco
  if (!messages && offer) {
    const offerLinks = links.filter((item) => item.offer_id === offer.id);
    if (offerLinks.length > 0) {
      const generated = generateAllMessages(offer, offerLinks);
      const instagram = generated.instagram ? [
        generated.instagram.feed,
        "",
        "=== STORIES SUGERIDOS ===",
        ...generated.instagram.stories.map((s) => `• ${s}`),
        "",
        "=== REELS SUGERIDO ===",
        ...generated.instagram.reels.map((r) => `- ${r}`),
        "",
        "=== CARROSSEL SUGERIDO ===",
        ...generated.instagram.carousel.map((c) => `- ${c}`)
      ].join("\n") : "Sem link do Instagram disponível.";

      messages = {
        telegram: generated.telegram,
        instagramFeed: instagram,
        whatsapp: generated.whatsapp
      };
    }
  }

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">Mensagens Criativas</h1>
        <p className="text-xs text-white/35 mt-1">Gere e copie legendas de alta conversão para os seus canais de vendas.</p>
      </header>

      {offers.length ? (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-start">
          {/* Menu Lateral de Ofertas */}
          <aside className="glass-card p-4 grid gap-3">
            <h2 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.1em]">Selecionar Oferta</h2>
            <div className="grid gap-2 max-h-[450px] overflow-y-auto pr-1">
              {offers.map((item) => {
                const isActive = item.id === offer.id;
                return (
                  <Link
                    key={item.id}
                    href={`/messages?offerId=${item.id}`}
                    className={`focus-ring block rounded-lg border p-3 transition text-left ${
                      isActive
                        ? "border-emerald-500/30 bg-emerald-500/10 text-white font-semibold"
                        : "border-white/[0.04] text-white/50 hover:bg-white/[0.03] hover:text-white/70"
                    }`}
                  >
                    <p className="text-xs font-semibold truncate">{item.product_name}</p>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-ink/50">
                      <span>{item.platform}</span>
                      <span className="font-bold text-moss">{item.score}/10</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>

          {/* Área de Visualização e Geração das Mensagens */}
          <section className="grid gap-4">
            <div className="glass-card p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-white">{offer.product_name}</h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge label={offer.platform} />
                  <span className="text-xs text-white/40">Score: <strong className="text-emerald-400">{offer.score}/10</strong></span>
                  {isAIGenerated && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      Gerado por IA (Groq)
                    </span>
                  )}
                </div>
              </div>
              <GenerateAIMessagesButton offerId={offer.id} />
            </div>

            {messages && (
              <div className="grid gap-4">
                <MessageBlock title="Telegram (Canal)" content={messages.telegram} />
                <MessageBlock title="Instagram (Legendas e Roteiros)" content={messages.instagramFeed} />
                <MessageBlock title="WhatsApp (Lista / Canal)" content={messages.whatsapp} />
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-white/30">
            Cadastre uma oferta para poder gerar e visualizar as mensagens.
          </p>
        </div>
      )}
    </div>
  );
}

function MessageBlock({ title, content }: { title: string; content: string }) {
  return (
    <article className="glass-card p-5">
      <header className="flex items-center justify-between gap-4 border-b border-white/[0.04] pb-3 mb-3">
        <h3 className="text-sm font-bold text-white/60">{title}</h3>
        <CopyToClipboardButton text={content} />
      </header>
      <pre className="whitespace-pre-wrap rounded-lg bg-white/[0.02] border border-white/[0.03] p-4 text-sm leading-6 text-white/70 font-sans max-h-[350px] overflow-y-auto">
        {content}
      </pre>
    </article>
  );
}
