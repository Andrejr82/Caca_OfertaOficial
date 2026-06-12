import { PublishTelegramButton } from "@/components/telegram/telegram-actions";
import { officialBrand, hasTelegramEnv } from "@/lib/env";
import { listOffers, getPostHistory } from "@/lib/offers/queries";
import { PostHistoryTable } from "@/components/dashboard/post-history-table";
import { Bot } from "lucide-react";

export default async function TelegramPage() {
  const configured = hasTelegramEnv();
  const offers = (await listOffers()).filter((offer) => offer.status === "approved");
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
          <p className="text-xs text-white/35">{officialBrand.telegramName} - {officialBrand.telegramUrl}</p>
        </div>
      </header>

      {/* Approved offers ready for posting */}
      <section className="glass-card p-5">
        <div className="flex items-center gap-2 border-b border-white/[0.04] pb-3 mb-4">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Prontas para Postagem</h2>
          <span className="grid h-5 min-w-5 place-items-center rounded-md bg-sky-500/15 px-1.5 text-[10px] font-extrabold text-sky-400">
            {offers.length}
          </span>
        </div>
        <div className="space-y-2">
          {offers.length ? offers.map((offer) => (
            <div key={offer.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.03] p-3 transition-colors hover:bg-white/[0.02]">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/80 truncate">{offer.product_name}</p>
                <p className="text-[11px] text-white/35">Score {offer.score}/10</p>
              </div>
              <PublishTelegramButton disabled={!configured} offerId={offer.id} />
            </div>
          )) : (
            <p className="py-4 text-center text-sm text-white/30">Nenhuma oferta aprovada para publicar.</p>
          )}
        </div>
      </section>

      {/* Post History */}
      <section className="grid gap-4">
        <PostHistoryTable initialData={historyData} channelName="telegram" />
      </section>
    </div>
  );
}
