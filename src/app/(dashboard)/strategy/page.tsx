import { AlertTriangle, CalendarClock, CheckCircle2, Compass, MessageCircle, ShieldCheck, Target } from "lucide-react";

const schedule = [
  { time: "07h–09h", channels: "WhatsApp · Status · Stories", focus: "Cupom simples, casa, utilidades e reposição", marketplaces: "Shopee · Amazon · Mercado Livre" },
  { time: "11h–13h", channels: "WhatsApp · Stories", focus: "Eletrônicos acessíveis, air fryer, fones e escritório", marketplaces: "Amazon · Mercado Livre · Shopee" },
  { time: "14h–16h", channels: "Instagram Reel · Stories", focus: "Produto demonstrável: organização, casa, beleza e gadgets", marketplaces: "Shopee · Amazon" },
  { time: "17h–19h", channels: "WhatsApp · Status · Telegram", focus: "Melhor oferta do dia, cupom e queda real de preço", marketplaces: "Mercado Livre · Shopee" },
  { time: "20h–22h", channels: "Instagram Reel · Feed · WhatsApp", focus: "Comparativos e ticket médio/alto: TV, notebook, celular e eletro", marketplaces: "Amazon · Mercado Livre" },
  { time: "22h–00h", channels: "WhatsApp · Stories", focus: "Seleção curta de cupons e achadinhos", marketplaces: "Shopee · Mercado Livre" }
];

const channelPlan = [
  ["WhatsApp", "3–5 ofertas/dia no início; intervalo mínimo de 2 h", "Canal principal: conversão e cupons"],
  ["Instagram", "1 Reel/dia; 1–2 blocos de Stories/dia; carrossel opcional", "Descoberta visual e preparação para vídeos"],
  ["Telegram", "1–2 melhores ofertas/dia; intervalo mínimo de 4 h", "Audiência pequena: presença sem desperdiçar inventário"],
  ["Facebook", "Somente reaproveitar os melhores criativos", "Alcance complementar, sem prioridade operacional"],
];

export default function StrategyPage() {
  return (
    <div className="grid gap-6 pb-10 animate-fadeIn">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
          <Compass size={22} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Estratégia de Publicação</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-white/45">Grade adaptada à audiência atual: WhatsApp é o canal principal; Instagram concentra descoberta em Reels; Telegram recebe apenas uma seleção curta.</p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="glass-card border border-emerald-500/15 p-5">
          <Target size={18} className="text-emerald-300" />
          <h2 className="mt-3 font-bold text-white">Prioridade comercial</h2>
          <p className="mt-2 text-sm leading-6 text-white/45">Eletrônicos, telefonia, informática, eletroportáteis, casa, beleza, esporte e games.</p>
        </article>
        <article className="glass-card border border-sky-500/15 p-5">
          <ShieldCheck size={18} className="text-sky-300" />
          <h2 className="mt-3 font-bold text-white">Só com evidência</h2>
          <p className="mt-2 text-sm leading-6 text-white/45">Preço, cupom, frete, desconto e urgência precisam ser verificáveis na fonte.</p>
        </article>
        <article className="glass-card border border-amber-500/15 p-5">
          <AlertTriangle size={18} className="text-amber-300" />
          <h2 className="mt-3 font-bold text-white">Nunca publicar</h2>
          <p className="mt-2 text-sm leading-6 text-white/45">Réplicas, armas, tabaco, adulto, medicamentos e alegações de saúde/finanças sem comprovação.</p>
        </article>
      </section>

      <section className="glass-card overflow-hidden border border-white/[0.05]">
        <div className="border-b border-white/[0.05] p-5">
          <h2 className="flex items-center gap-2 font-bold text-white"><CalendarClock size={18} className="text-violet-300" /> Grade diária recomendada</h2>
          <p className="mt-1 text-sm text-white/40">Horários de teste — não são promessa de performance.</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {schedule.map((item) => (
            <article key={item.time} className="grid gap-3 p-5 sm:grid-cols-[7rem_1fr] lg:grid-cols-[7rem_11rem_1fr_13rem] lg:items-center">
              <p className="font-black tabular-nums text-violet-200">{item.time}</p>
              <p className="text-sm font-semibold text-white/75">{item.channels}</p>
              <p className="text-sm leading-6 text-white/50">{item.focus}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/80">{item.marketplaces}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="glass-card border border-white/[0.05] p-5">
          <h2 className="font-bold text-white">Cadência por canal</h2>
          <div className="mt-4 space-y-4">
            {channelPlan.map(([channel, cadence, objective]) => (
              <div key={channel} className="rounded-xl bg-white/[0.025] p-4">
                <p className="font-bold text-white">{channel}</p>
                <p className="mt-1 text-sm leading-6 text-white/55">{cadence}</p>
                <p className="mt-2 text-xs font-semibold text-emerald-300/80">{objective}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card border border-emerald-500/15 p-5">
          <div className="flex items-center gap-2"><MessageCircle size={18} className="text-emerald-300" /><h2 className="font-bold text-white">Plano de escala do WhatsApp</h2></div>
          <ol className="mt-4 space-y-4 text-sm leading-6 text-white/55">
            <li><strong className="text-white">1. Semana 1–2:</strong> 3–5 ofertas/dia, espaçadas em pelo menos 2 horas. Priorizar cupom, queda real de preço e confiança.</li>
            <li><strong className="text-white">2. Semana 3–4:</strong> subir para 5–8/dia somente se cliques por envio e descadastros permanecerem saudáveis.</li>
            <li><strong className="text-white">3. Semana 5–6:</strong> testar horários e categorias vencedoras antes de aumentar volume.</li>
            <li><strong className="text-white">Escala futura:</strong> acima de 8/dia apenas com crescimento comprovado da audiência e segmentação.</li>
          </ol>
          <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100/80">
            WhatsApp exige audiência com consentimento e relevância. A meta é aumentar receita por destinatário sem provocar fadiga, bloqueios ou perda de confiança.
          </div>
        </article>
      </section>

      <section className="glass-card border border-white/[0.05] p-5">
        <h2 className="font-bold text-white">Como decidir o que permanece</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["CTR por canal e horário", "Conversão e comissão líquida", "Repetição/fadiga por categoria", "Bloqueios, descadastros e falhas"].map((metric) => (
            <p key={metric} className="flex min-h-11 items-center gap-2 rounded-lg bg-white/[0.025] px-3 text-sm text-white/60"><CheckCircle2 size={16} className="shrink-0 text-emerald-300" />{metric}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
