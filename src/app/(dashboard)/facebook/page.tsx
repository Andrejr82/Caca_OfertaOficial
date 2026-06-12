import { getPostHistory } from "@/lib/offers/queries";
import { PostHistoryTable } from "@/components/dashboard/post-history-table";
import { Facebook } from "lucide-react";

export default async function FacebookPage() {
  const historyData = await getPostHistory("facebook");

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
          <Facebook size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Facebook</h1>
          <p className="text-xs text-white/35">Histórico de postagens e análise de conversões para páginas e grupos.</p>
        </div>
      </header>

      {/* Post History */}
      <section className="grid gap-4">
        <PostHistoryTable initialData={historyData} channelName="facebook" />
      </section>
    </div>
  );
}
