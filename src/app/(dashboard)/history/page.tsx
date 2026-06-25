import { getIntegrationLogs } from "@/lib/logs/queries";
import { Activity, CheckCircle2, Clock, TerminalSquare, AlertCircle } from "lucide-react";

export default async function HistoryPage() {
  const logs = await getIntegrationLogs(100);

  // Data de hoje em Brasília (formato YYYY-MM-DD)
  const todayDateStr = new Intl.DateTimeFormat('fr-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  
  const todayLogs = logs.filter(log => {
    const logBrDateStr = new Intl.DateTimeFormat('fr-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(log.created_at));
    return logBrDateStr === todayDateStr;
  });
  
  let totalScrapedToday = 0;
  let totalAiProcessedToday = 0;
  let successCountToday = 0;

  todayLogs.forEach(log => {
    if (log.status === "success") successCountToday++;
    if (log.metadata?.total_scraped) totalScrapedToday += log.metadata.total_scraped;
    if (log.metadata?.ai_processed) totalAiProcessedToday += log.metadata.ai_processed;
  });

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
          <TerminalSquare size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Histórico do Robô</h1>
          <p className="text-xs text-white/40">Acompanhe as execuções, raspagens e métricas dos robôs no servidor.</p>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 border-l-2 border-l-emerald-500 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-white/50 text-xs font-bold uppercase tracking-wider">
            <CheckCircle2 size={14} className="text-emerald-400" />
            Ciclos de Sucesso (Hoje)
          </div>
          <div className="text-3xl font-black text-white">{successCountToday}</div>
        </div>

        <div className="glass-card p-5 border-l-2 border-l-blue-500 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-white/50 text-xs font-bold uppercase tracking-wider">
            <Activity size={14} className="text-blue-400" />
            Produtos Raspados (Hoje)
          </div>
          <div className="text-3xl font-black text-white">{totalScrapedToday}</div>
        </div>

        <div className="glass-card p-5 border-l-2 border-l-purple-500 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-white/50 text-xs font-bold uppercase tracking-wider">
            <TerminalSquare size={14} className="text-purple-400" />
            Posts Gerados via IA (Hoje)
          </div>
          <div className="text-3xl font-black text-white">{totalAiProcessedToday}</div>
        </div>
      </div>

      {/* Logs Table */}
      <section className="glass-card p-5 w-full overflow-hidden flex flex-col">
        <div className="border-b border-white/[0.04] pb-3 mb-4 flex-shrink-0">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Últimas Execuções</h2>
        </div>
        
        <div className="overflow-x-auto w-full pb-4">
          <div className="min-w-[800px]">
            <table className="w-full text-left text-sm text-white/70">
              <thead className="text-xs uppercase text-white/40 bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg font-semibold">Data/Hora</th>
                  <th className="px-4 py-3 font-semibold">Integração</th>
                  <th className="px-4 py-3 font-semibold">Ação</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 rounded-r-lg font-semibold">Mensagem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {logs.length > 0 ? logs.map((log) => {
                  const dateObj = new Date(log.created_at);
                  const isSuccess = log.status === "success";
                  return (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-white/30" />
                          <span>{dateObj.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                          <span className="text-white/40">{dateObj.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-white/90">
                        {log.integration}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-white/70 ring-1 ring-inset ring-white/10">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isSuccess ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          {log.status}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {log.message}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-white/30">
                      Nenhum histórico encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
