import type { OptimizationRecommendation } from "../optimization/optimization-engine";

export interface AutomationPolicy {
  name: string;
  description: string;
  scope: string;
  targetEngine: string;
  canExecuteAutomatically: boolean;
  requiresHumanApproval: boolean;
  allowsRollback: boolean;
  isActive: boolean;
}

export interface ExecutionLog {
  recommendationTitle: string;
  engineAffected: string;
  executor: string;
  executedAt: string;
  resultStatus: "EXECUTED" | "REJECTED_BY_POLICY" | "PENDING_APPROVAL";
  executionTimeMs: number;
  rollbackAvailable: boolean;
  rollbackInstructions: string;
  observability: {
    approvedBy: string;
    executedBy: string;
    originRecommendation: string;
    originOptimization: string;
    originLearning: string;
    originAnalytics: string;
  };
}

export class MarketplaceAutomationEngine {
  /**
   * Automation Engine JAMAIS toma decisões por conta própria.
   * Ele apenas atua como executor controlado das Recomendações de Otimização.
   * Toda execução exige que uma Policy ativa a permita, e que haja aprovação
   * (humana ou sistêmica) conforme exigido pela Policy.
   */

  static getPolicies(): AutomationPolicy[] {
    return [
      {
        name: "Policy: Escala de IA Segura",
        description: "Permite escalar chamadas de IA (liberando budget).",
        scope: "AI Decision Engine",
        targetEngine: "AI Decision Engine",
        canExecuteAutomatically: false,
        requiresHumanApproval: true,
        allowsRollback: true,
        isActive: true
      },
      {
        name: "Policy: Ajuste de Tração",
        description: "Altera prioridade de categorias/marketplaces na base de extração e publicação.",
        scope: "Ranking & Publication",
        targetEngine: "Ranking Engine / Publication Pipeline",
        canExecuteAutomatically: false,
        requiresHumanApproval: true,
        allowsRollback: true,
        isActive: true
      },
      {
        name: "Policy: Contenção de Qualidade",
        description: "Trava extratores se o tier LIXO / rejeição aumentar subitamente.",
        scope: "Quality & Scraper",
        targetEngine: "Quality Engine / Oracle Scraper",
        canExecuteAutomatically: false, // For safety, in this architecture we require approval
        requiresHumanApproval: true,
        allowsRollback: true,
        isActive: true
      },
      {
        name: "Policy: Ajuste Genérico de Quality",
        description: "Ajuste fino nas regras de validação baseada em CTR.",
        scope: "Quality Engine",
        targetEngine: "Quality Engine",
        canExecuteAutomatically: false,
        requiresHumanApproval: true,
        allowsRollback: true,
        isActive: true
      }
    ];
  }

  static execute(
    recommendation: OptimizationRecommendation, 
    approved: boolean = false, 
    approvedBy: string = "Pending"
  ): ExecutionLog {
    const policies = this.getPolicies();
    
    // Busca policy aplicável por target engine
    const policy = policies.find(p => p.targetEngine.includes(recommendation.targetEngine) || recommendation.targetEngine.includes(p.targetEngine));

    const timestamp = new Date().toISOString();

    const log: ExecutionLog = {
      recommendationTitle: recommendation.title,
      engineAffected: recommendation.targetEngine,
      executor: "MarketplaceAutomationEngine",
      executedAt: timestamp,
      resultStatus: "PENDING_APPROVAL",
      executionTimeMs: 0,
      rollbackAvailable: policy?.allowsRollback ?? false,
      rollbackInstructions: policy?.allowsRollback 
        ? `Reverter estado da ${recommendation.targetEngine} para a configuração (snapshot) anterior ao timestamp ${timestamp}.` 
        : "Ação irreversível de acordo com a Policy.",
      observability: {
        approvedBy: approved ? approvedBy : "N/A",
        executedBy: "MarketplaceAutomationEngine",
        originRecommendation: recommendation.title,
        originOptimization: "Marketplace Optimization Engine",
        originLearning: recommendation.learningUsed,
        originAnalytics: recommendation.analyticsUsed
      }
    };

    if (!policy) {
      log.resultStatus = "REJECTED_BY_POLICY";
      log.rollbackInstructions = "Policy não encontrada para esta Engine. Execução abortada por segurança.";
      return log;
    }

    if (!policy.isActive) {
      log.resultStatus = "REJECTED_BY_POLICY";
      log.rollbackInstructions = "Policy inativa. Execução abortada.";
      return log;
    }

    if (policy.requiresHumanApproval && !approved) {
      log.resultStatus = "PENDING_APPROVAL";
      log.rollbackInstructions = "Aguardando aprovação humana obrigatória. Nenhuma ação tomada.";
      return log;
    }

    // Se chegou aqui, a policy permite e está aprovado.
    // Simulação da latência da execução.
    const start = performance.now();
    // [CÓDIGO DE EXECUÇÃO REAL ENTRARIA AQUI]
    // ex: await api.updateEngineConfig(policy.targetEngine, recommendation.parameters);
    const end = performance.now();

    log.resultStatus = "EXECUTED";
    log.executionTimeMs = Math.round((end - start) * 100) / 100; // Simulated time

    return log;
  }
}
