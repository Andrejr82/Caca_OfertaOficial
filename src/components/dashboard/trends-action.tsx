"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { MAIN_CATEGORY_NAMES } from "@/lib/offers/category-taxonomy";

const sourceLabels = {
  mercadolivre: "Mercado Livre",
  magalu: "Magalu",
  shopee: "Shopee",
  shein: "Shein",
  amazon: "Amazon",
  netshoes: "Netshoes"
} as const;

const defaultProductSources = {
  mercadolivre: true,
  magalu: false,
  shopee: false,
  shein: false,
  amazon: false,
  netshoes: false
};

const defaultCouponSources = {
  mercadolivre: false,
  magalu: true,
  shopee: false,
  shein: true,
  amazon: true,
  netshoes: false
};

const couponAvailability = {
  mercadolivre: "temporarily_unavailable",
  magalu: "supported",
  shopee: "supported",
  shein: "supported",
  amazon: "supported",
  netshoes: "unsupported"
} as const;

export function TrendsAction() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [productSources, setProductSources] = useState(defaultProductSources);
  const [couponSources, setCouponSources] = useState(defaultCouponSources);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [mode, setMode] = useState<"products" | "coupons">("products");

  useEffect(() => {
    try {
      const savedProducts = localStorage.getItem("caca_oferta_selected_sources_products");
      const savedCoupons = localStorage.getItem("caca_oferta_selected_sources_coupons");

      if (savedProducts) {
        const parsed = JSON.parse(savedProducts);
        if (parsed && typeof parsed === "object") {
          setProductSources((prev) => ({
            ...prev,
            ...parsed
          }));
        }
      }

      if (savedCoupons) {
        const parsed = JSON.parse(savedCoupons);
        if (parsed && typeof parsed === "object") {
          setCouponSources((prev) => ({
            ...prev,
            ...parsed,
            netshoes: false
          }));
        }
      }
    } catch (error) {
      console.error("[localStorage] Erro ao carregar fontes selecionadas:", error);
    }
  }, []);

  const sources = mode === "products" ? productSources : couponSources;
  const setSources = mode === "products" ? setProductSources : setCouponSources;

  const handleSourceChange = (key: keyof typeof sources, checked: boolean) => {
    const updated = { ...sources, [key]: checked };
    setSources(updated);
    try {
      localStorage.setItem(
        mode === "products" ? "caca_oferta_selected_sources_products" : "caca_oferta_selected_sources_coupons",
        JSON.stringify(updated)
      );
    } catch (error) {
      console.error("[localStorage] Erro ao salvar fontes selecionadas:", error);
    }
  };

  const activeSourcesCount = Object.entries(sources).filter(([key, enabled]) => {
    if (!enabled) return false;
    if (mode === "products") return true;
    return couponAvailability[key as keyof typeof couponAvailability] === "supported";
  }).length;

  const [limit, setLimit] = useState<number>(20);
  const [category, setCategory] = useState<string>("Geral");

  async function handleFetchTrends() {
    if (activeSourcesCount === 0) {
      setResult({
        success: false,
        message: "Selecione pelo menos uma fonte."
      });
      return;
    }

    setLoading(true);
    setResult(null);

    // Mapeamento interno de nomes amigáveis para a API
    const selectedSources = (Object.keys(sourceLabels) as Array<keyof typeof sourceLabels>)
      .filter((key) => {
        if (!sources[key]) return false;
        if (mode === "products") return true;
        return couponAvailability[key] === "supported";
      })
      .map((key) => sourceLabels[key]);

    try {
      const endpoint = mode === "products" ? "/api/scraper/trends" : "/api/scraper/coupons";
      const bodyPayload = mode === "products" 
        ? { sources: selectedSources, limit, category } 
        : { sources: selectedSources, limit };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        setResult({
          success: true,
          message: data.message || "Ação concluída com sucesso!"
        });
        router.refresh();
      } else {
        setResult({
          success: false,
          message: data.message || "Falha ao obter dados das fontes selecionadas."
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-white/[0.05] pb-4 mb-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setMode("products")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === "products" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-white/50 hover:text-white/80"}`}
          >
            📦 Buscar Produtos (Achadinhos)
          </button>
          <button 
            onClick={() => setMode("coupons")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === "coupons" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/5 text-white/50 hover:text-white/80"}`}
          >
            🎫 Buscar Cupons Ativos
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1">
          <h2 className="text-sm font-bold text-white/70 flex items-center gap-2">
            <Sparkles className={mode === "products" ? "text-emerald-400" : "text-blue-400"} size={16} />
            {mode === "products" ? "Robô de Tendências" : "Motor de Cupons"}
          </h2>
          <p className="text-xs text-white/35 mt-1">
            {mode === "products" 
              ? "Varre os itens mais vendidos das plataformas selecionadas, extrai dados de produtos e gera rascunhos com IA."
              : "Varre as páginas oficiais de cupons das plataformas e extrai códigos de desconto disponíveis."}
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            {(Object.keys(sourceLabels) as Array<keyof typeof sourceLabels>).map((key) => {
              const couponState = couponAvailability[key];
              const isCouponSupported = couponState === "supported";
              const disabledInCoupons = mode === "coupons" && !isCouponSupported;
              const helperText =
                mode === "coupons" && couponState === "unsupported"
                  ? "Não suportado"
                  : mode === "coupons" && couponState === "temporarily_unavailable"
                    ? "Indisponível no momento"
                    : null;

              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 text-sm font-medium ${disabledInCoupons ? "cursor-not-allowed text-white/35" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={sources[key]}
                    disabled={disabledInCoupons}
                    onChange={(e) => handleSourceChange(key, e.target.checked)}
                    className="rounded border-moss/20 text-moss focus:ring-moss h-4 w-4 disabled:opacity-50"
                  />
                  <span>{sourceLabels[key]}</span>
                  {helperText ? <span className="text-[11px] text-amber-400">{helperText}</span> : null}
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            {mode === "products" && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-white/70">Categoria Alvo:</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-ink border border-moss/20 rounded-md text-sm text-white px-2 py-1.5 focus:ring-moss focus:border-moss outline-none w-48"
                >
                  <option value="Geral">Geral (Roleta Aleatória)</option>
                  {MAIN_CATEGORY_NAMES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-white/70">{mode === "products" ? "Itens por loja:" : "Cupons por loja:"}</label>
              <input
                type="number"
                min="1"
                max="100"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 1)}
                className="bg-ink border border-moss/20 rounded-md text-sm text-white px-2 py-1.5 focus:ring-moss focus:border-moss outline-none w-20"
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-start mt-4 lg:mt-0">
          <Button 
            disabled={loading || activeSourcesCount === 0} 
            onClick={handleFetchTrends} 
            type="button"
            className={`w-full lg:w-auto text-white ${mode === "products" ? "bg-moss hover:bg-ink" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Buscando...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {mode === "products" ? "Buscar Tendências" : "Caçar Cupons"}
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
