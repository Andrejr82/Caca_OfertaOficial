import { PublishClient } from "./publish-client";
import { Zap } from "lucide-react";

export default function PublishPage({ searchParams }: { searchParams: { url?: string } }) {
  return (
    <div className="grid gap-6 animate-fadeIn w-full max-w-4xl mx-auto min-w-0">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-orange-500/20">
          <Zap size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Publicação Expressa</h1>
          <p className="text-xs text-white/40">Cole o link de afiliado da loja para rastrear, gerar a copy com Inteligência Artificial e publicar com apenas um clique.</p>
        </div>
      </header>

      {/* Main Client Area */}
      <section className="glass-card p-5 md:p-8 min-w-0 overflow-hidden">
        <PublishClient initialUrl={searchParams.url || ""} />
      </section>
    </div>
  );
}
