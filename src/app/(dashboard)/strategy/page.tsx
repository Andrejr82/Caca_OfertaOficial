import { AlertTriangle, CalendarClock, CheckCircle2, Compass, MessageCircle, ShieldCheck, Target } from "lucide-react";

const schedule = [
  { discovery: "06h", time: "07h", focus: "Cama, mesa, banho, utensílios, cafeteiras, air fryers", marketplaces: "casa_cozinha_editorial" },
  { discovery: "07h", time: "08h", focus: "Organizadores, caixas, cestos, cabides, limpeza", marketplaces: "organizacao_editorial" },
  { discovery: "08h", time: "09h", focus: "Furadeiras, parafusadeiras, manuais, kits", marketplaces: "ferramentas_editorial" },
  { discovery: "09h", time: "10h", focus: "Notebooks, computadores, monitores, impressoras", marketplaces: "informatica_editorial" },
  { discovery: "10h", time: "11h", focus: "Smartphones, celulares, capas, carregadores", marketplaces: "celulares_editorial" },
  { discovery: "11h", time: "12h", focus: "Skincare, maquiagem, perfumes, cabelo e autocuidado", marketplaces: "beleza_editorial" },
  { discovery: "12h", time: "13h", focus: "Roupas, calçados, bolsas, relógios e acessórios", marketplaces: "moda_editorial" },
  { discovery: "13h", time: "14h", focus: "Academia, corrida, yoga, fitness e esportes", marketplaces: "esporte_editorial" },
  { discovery: "14h", time: "15h", focus: "Ração, brinquedos, camas, higiene e transporte pet", marketplaces: "pet_editorial" },
  { discovery: "15h", time: "16h", focus: "Acessórios, ferramentas automotivas, som e manutenção", marketplaces: "automotivo_editorial" },
  { discovery: "16h", time: "17h", focus: "Consoles, jogos, controles, cadeiras e acessórios", marketplaces: "games_editorial" },
  { discovery: "17h", time: "18h", focus: "TVs, soundbars, caixas de som, fones", marketplaces: "tv_audio_editorial" },
  { discovery: "18h", time: "19h", focus: "Geladeiras, fogões, micro-ondas, lavadoras", marketplaces: "eletrodomesticos_editorial" },
  { discovery: "19h", time: "20h", focus: "Camas, sofás, mesas, cadeiras, racks, escritórios", marketplaces: "moveis_editorial" },
  { discovery: "20h", time: "21h", focus: "Ofertas de qualquer categoria com maior desconto", marketplaces: "grandes_ofertas_editorial" },
  { discovery: "21h", time: "22h", focus: "Apenas cupons cadastrados, aprovados manualmente", marketplaces: "cupons_aprovados_editorial" },
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
          <h2 className="flex items-center gap-2 font-bold text-white"><CalendarClock size={18} className="text-violet-300" /> Grade diária de cenários (Brasília)</h2>
          <p className="mt-1 text-sm text-white/40">Oracle descobre 1h antes da publicação. Intro Telegram disparada no horário de discovery.</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          <div className="hidden lg:grid lg:grid-cols-[5rem_5rem_1fr_14rem] gap-3 px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-white/25">
            <span>Discovery</span><span>Publicação</span><span>Foco editorial</span><span>Cenário</span>
          </div>
          {schedule.map((item) => (
            <article key={item.time} className="grid gap-1 p-5 sm:grid-cols-[5rem_5rem_1fr] lg:grid-cols-[5rem_5rem_1fr_14rem] lg:items-center">
              <p className="tabular-nums text-sm font-semibold text-white/40">{item.discovery}</p>
              <p className="font-black tabular-nums text-violet-200">{item.time}</p>
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
