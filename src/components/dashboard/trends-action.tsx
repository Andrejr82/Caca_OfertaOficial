"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TrendsAction() {
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState({
    mercadolivre: true,
    shopee: false,
    shein: false
  });
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const activeSourcesCount = Object.values(sources).filter(Boolean).length;

  async function handleFetchTrends() {
    if (activeSourcesCount === 0) {
      setResult({
        success: false,
        message: "Selecione pelo menos uma fonte de tendências."
      });
      return;
    }

    setLoading(true);
    setResult(null);

    // Mapeamento interno de nomes amigáveis para a API
    const selectedSources = [];
    if (sources.mercadolivre) selectedSources.push("Mercado Livre");
    if (sources.shopee) selectedSources.push("Shopee");
    if (sources.shein) selectedSources.push("Shein");

    try {
      const response = await fetch("/api/scraper/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: selectedSources })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        setResult({
          success: true,
          message: data.message || "Tendências importadas com sucesso!"
        });
        // Recarrega a página para atualizar a lista de ofertas no dashboard
        window.location.reload();
      } else {
        setResult({
          success: false,
          message: data.message || "Falha ao obter tendências das fontes selecionadas."
        });
      }
    } catch (error) {
      console.error(error);
      setResult({
        success: false,
        message: "Ocorreu um erro de rede ao tentar iniciar o robô."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1">
          <h2 className="text-sm font-bold text-white/70 flex items-center gap-2">
            <Sparkles className="text-emerald-400" size={16} />
            Robô de Tendências
          </h2>
          <p className="text-xs text-white/35 mt-1">
            Varre os itens mais vendidos das plataformas selecionadas, extrai dados de produtos e gera rascunhos com IA.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={sources.mercadolivre}
                onChange={(e) => setSources({ ...sources, mercadolivre: e.target.checked })}
                className="rounded border-moss/20 text-moss focus:ring-moss h-4 w-4"
              />
              Mercado Livre
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={sources.shopee}
                onChange={(e) => setSources({ ...sources, shopee: e.target.checked })}
                className="rounded border-moss/20 text-moss focus:ring-moss h-4 w-4"
              />
              Shopee
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={sources.shein}
                onChange={(e) => setSources({ ...sources, shein: e.target.checked })}
                className="rounded border-moss/20 text-moss focus:ring-moss h-4 w-4"
              />
              Shein
            </label>
          </div>
        </div>
        <div className="flex shrink-0 items-start">
          <Button 
            disabled={loading || activeSourcesCount === 0} 
            onClick={handleFetchTrends} 
            type="button"
            className="w-full lg:w-auto bg-moss hover:bg-ink text-white"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Buscando e Analisando...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Buscar Tendências
              </>
            )}
          </Button>
        </div>
      </div>

      {result && (
        <div className={`mt-4 rounded-lg p-3 text-sm ${result.success ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}
