import { getPostHistory } from "@/lib/offers/queries";
import { PostHistoryTable } from "@/components/dashboard/post-history-table";
import { officialBrand } from "@/lib/env";
import { MessageCircle } from "lucide-react";

export default async function WhatsappPage() {
  const historyData = await getPostHistory("whatsapp");

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20">
          <MessageCircle size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">WhatsApp</h1>
          <p className="text-xs text-white/35">{officialBrand.whatsappName} - Lista de postagens enviadas para grupos e canais.</p>
        </div>
      </header>

      {/* Post History */}
      <section className="grid gap-4">
        <PostHistoryTable initialData={historyData} channelName="whatsapp" />
      </section>
    </div>
  );
}
