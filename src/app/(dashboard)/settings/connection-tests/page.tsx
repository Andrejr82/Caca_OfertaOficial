"use client";

import { useState } from "react";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Play, RefreshCw } from "lucide-react";

interface TestStatus {
  platform: string;
  category: "Rede Social" | "Plataforma de Vendas";
  status: "idle" | "testing" | "success" | "error";
  lastCheck?: string;
  message?: string;
}

export default function ConnectionTestsPage() {
  const [testStates, setTestStates] = useState<TestStatus[]>([
    { platform: "Instagram", category: "Rede Social", status: "idle" },
    { platform: "Telegram", category: "Rede Social", status: "idle" },
    { platform: "Facebook", category: "Rede Social", status: "idle" },
    { platform: "WhatsApp", category: "Rede Social", status: "idle" },
    { platform: "Mercado Livre", category: "Plataforma de Vendas", status: "idle" },
    { platform: "Amazon", category: "Plataforma de Vendas", status: "idle" },
    { platform: "Shopee", category: "Plataforma de Vendas", status: "idle" },
    { platform: "Shein", category: "Plataforma de Vendas", status: "idle" }
  ]);

  async function handleTest(platformName: string) {
    // Atualiza status para testando
    setTestStates(prev => prev.map(item => 
      item.platform === platformName ? { ...item, status: "testing", message: undefined } : item
    ));

    try {
      const response = await fetch("/api/settings/connection-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformName })
      });
      const data = await response.json();

      setTestStates(prev => prev.map(item => 
        item.platform === platformName 
          ? { 
              ...item, 
              status: data.ok ? "success" : "error", 
              lastCheck: data.lastCheck || new Date().toLocaleString("pt-BR"),
              message: data.message 
            } 
          : item
      ));
    } catch {
      setTestStates(prev => prev.map(item => 
        item.platform === platformName 
          ? { 
              ...item, 
              status: "error", 
              lastCheck: new Date().toLocaleString("pt-BR"),
              message: "Falha de rede ao tentar se comunicar com o endpoint de testes." 
            } 
          : item
      ));
    }
  }

  async function handleTestAll() {
    for (const item of testStates) {
      await handleTest(item.platform);
    }
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-3xl font-black text-ink">Configurações</h1>
        <p className="text-sm text-ink/60">Configuração de canais, integrações e segurança da plataforma.</p>
      </header>
      
      <SettingsTabs activeTab="tests" />

      <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-moss/10 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-black">Testes de Conexão</h2>
            <p className="text-sm text-ink/60">Valide individualmente se as integrações e chaves de APIs estão funcionando.</p>
          </div>
          <Button 
            onClick={handleTestAll} 
            type="button" 
            variant="secondary"
            className="flex items-center gap-1.5 font-bold"
          >
            <RefreshCw size={14} />
            Testar Todas
          </Button>
        </div>

        <div className="grid gap-4 mt-4">
          {testStates.map((item) => {
            const isTesting = item.status === "testing";
            return (
              <div 
                key={item.platform} 
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-moss/10 hover:border-moss/20 bg-paper/30 transition-all"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-base text-ink">{item.platform}</span>
                    <span className="text-[10px] uppercase font-bold text-ink/50 bg-paper px-2 py-0.5 rounded border border-moss/5">
                      {item.category}
                    </span>
                    {item.status === "success" && (
                      <Badge label="Conectado" tone="good" />
                    )}
                    {item.status === "error" && (
                      <Badge label="Erro" tone="warn" />
                    )}
                    {item.status === "idle" && (
                      <Badge label="Não testado" tone="future" />
                    )}
                  </div>
                  {item.message && (
                    <p className={`text-xs font-semibold ${item.status === "success" ? "text-moss" : "text-red-500"}`}>
                      {item.message}
                    </p>
                  )}
                  {item.lastCheck && (
                    <p className="text-[10px] text-ink/40">
                      Última validação: <span className="font-semibold">{item.lastCheck}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center shrink-0">
                  <Button
                    disabled={isTesting}
                    onClick={() => handleTest(item.platform)}
                    type="button"
                    className={`font-bold text-xs px-3 py-1.5 ${
                      item.status === "success" 
                        ? "bg-moss/10 text-moss hover:bg-moss/20" 
                        : "bg-moss hover:bg-ink text-white"
                    }`}
                  >
                    {isTesting ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Validando...
                      </>
                    ) : (
                      <>
                        <Play size={12} />
                        Executar Teste
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
