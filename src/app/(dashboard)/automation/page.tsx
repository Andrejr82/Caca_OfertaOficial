import { listOffers, listAffiliateLinks, listSales } from "@/lib/offers/queries";
import { MarketplaceAnalyticsEngine } from "@/core/analytics/analytics-engine";
import { MarketplaceLearningEngine } from "@/core/learning/learning-engine";
import { MarketplaceOptimizationEngine } from "@/core/optimization/optimization-engine";
import { MarketplaceAutomationEngine } from "@/core/automation/automation-engine";
import { Activity, ShieldCheck, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function AutomationPage() {
  const [offers, links, sales] = await Promise.all([
    listOffers(),
    listAffiliateLinks(),
    listSales()
  ]);

  const analytics = MarketplaceAnalyticsEngine.generateReport(offers, sales, links, []);
  const learning = MarketplaceLearningEngine.analyze(analytics);
  const optimization = MarketplaceOptimizationEngine.generateRecommendations(learning);
  const policies = MarketplaceAutomationEngine.getPolicies();
  
  // Simulando a aprovação da primeira recomendação apenas para ilustrar o log de execução
  const executionLogs = optimization.map((opt, idx) => {
    // Simulando que o admin aprovou apenas a primeira
    const isApproved = idx === 0;
    return MarketplaceAutomationEngine.execute(opt, isApproved, isApproved ? "Admin" : "Pending");
  });

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
          <Power size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Marketplace Automation</h1>
          <p className="text-xs text-white/35">Executor determinístico de políticas aprovadas. Fase 2 completada.</p>
        </div>
      </header>

      {/* TIMELINE DE AUTORIZAÇÃO */}
      <section className="glass-card p-5 w-full flex flex-col gap-2 border-l-4 border-cyan-500">
        <h2 className="text-sm font-bold text-white/50 uppercase flex items-center gap-2"><Activity size={16} /> Fluxo de Execução</h2>
        <div className="flex items-center gap-2 text-xs font-bold text-white/60 overflow-x-auto pb-2">
          <span>{optimization.length} Recomendações</span> <span className="text-white/20">→</span>
          <span className="text-indigo-400">Verificação de Policy</span> <span className="text-white/20">→</span>
          <span className="text-pink-400">Aprovação Segura</span> <span className="text-white/20">→</span>
          <span className="text-cyan-400">{executionLogs.filter(l => l.resultStatus === "EXECUTED").length} Executadas</span>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* POLICIES */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-white/50 uppercase flex items-center gap-2"><ShieldCheck size={16}/> Automation Policies</h2>
          {policies.map((pol, idx) => (
            <div key={idx} className="border border-white/[0.05] rounded-lg p-4 bg-white/[0.01]">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-bold text-white">{pol.name}</h3>
                <Badge label={pol.isActive ? "Ativa" : "Inativa"} tone={pol.isActive ? "good" : "neutral"} />
              </div>
              <p className="text-sm text-white/80 mb-3">{pol.description}</p>
              <div className="text-[10px] text-white/40 uppercase space-y-1">
                <div>Escopo: <span className="text-blue-300">{pol.scope}</span></div>
                <div>Aprovação Humana: <span className={pol.requiresHumanApproval ? "text-amber-400" : "text-emerald-400"}>{pol.requiresHumanApproval ? "OBRIGATÓRIA" : "DISPENSADA"}</span></div>
                <div>Rollback: {pol.allowsRollback ? "DISPONÍVEL" : "IRREVERSÍVEL"}</div>
              </div>
            </div>
          ))}
        </section>

        {/* EXECUTION LOGS */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-white/50 uppercase">Execution Logs</h2>
          {executionLogs.length > 0 ? executionLogs.map((log, idx) => (
            <div key={idx} className={`border border-white/[0.05] rounded-lg p-4 ${log.resultStatus === "EXECUTED" ? "bg-cyan-500/10 border-cyan-500/20" : "bg-white/[0.01]"}`}>
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-bold text-white line-clamp-1 pr-2" title={log.recommendationTitle}>{log.recommendationTitle}</h3>
                <Badge label={log.resultStatus} tone={log.resultStatus === "EXECUTED" ? "good" : log.resultStatus === "PENDING_APPROVAL" ? "warn" : "warn"} />
              </div>
              
              <div className="text-[10px] text-white/50 space-y-1 mt-3">
                <div className="font-bold text-white/70">Observabilidade:</div>
                <div>Engine Afetada: {log.engineAffected}</div>
                <div>Aprovado por: <span className="text-emerald-400 font-bold">{log.observability.approvedBy}</span></div>
                <div>Tempo de Execução: {log.executionTimeMs}ms</div>
                <div className="mt-2 text-white/40 border-t border-white/[0.05] pt-2">
                  <span className="block mb-1 font-bold">Instruções de Rollback:</span>
                  {log.rollbackInstructions}
                </div>
              </div>
            </div>
          )) : (
             <p className="text-sm text-white/30">Nenhuma recomendação em fila.</p>
          )}
        </section>
      </div>
    </div>
  );
}
