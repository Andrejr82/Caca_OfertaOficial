"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2, CircleAlert } from "lucide-react";
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
  mercadolivre: true,
  magalu: false,
  shopee: true,
  shein: false,
  amazon: true,
  netshoes: false
};

const productAvailability = {
  mercadolivre: "supported",
  magalu: "unsupported",
  shopee: "supported",
  shein: "unsupported",
  amazon: "supported",
  netshoes: "unsupported"
} as const;

const couponAvailability = {
  mercadolivre: "supported",
  magalu: "supported",
  shopee: "supported",
  shein: "supported",
  amazon: "supported",
  netshoes: "unsupported"
} as const;

const mercadolivreCouponTooltip =
  "Os cupons públicos do Mercado Livre não possuem uma fonte oficial estável para este módulo.\n\nA busca de PRODUTOS continua funcionando normalmente.";

const emptyManualCoupon = {
  marketplace: "Mercado Livre",
  code: "",
  discount: "",
  rules: "",
  validity: "",
  link: "",
  imageUrl: ""
};

export function TrendsAction() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [productSources, setProductSources] = useState(defaultProductSources);
  const [couponSources, setCouponSources] = useState(defaultCouponSources);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [mode, setMode] = useState<"products" | "coupons">("products");
  const [offers, setOffers] = useState<any[]>([]);
  const [manualCoupon, setManualCoupon] = useState(emptyManualCoupon);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<{ success: boolean; message: string } | null>(null);

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
    if (mode === "products" && productAvailability[key as keyof typeof productAvailability] !== "supported") {
      return;
    }
    if (mode === "coupons" && couponAvailability[key as keyof typeof couponAvailability] !== "supported") {
      return;
    }

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
    if (mode === "products") return productAvailability[key as keyof typeof productAvailability] === "supported";
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
        if (mode === "products") return productAvailability[key] === "supported";
        return couponAvailability[key] === "supported";
      })
      .map((key) => sourceLabels[key]);

    try {
      const endpoint = mode === "products" ? "/api/scraper/trends" : "/api/scraper/coupons";
      const bodyPayload = mode === "products" 
        ? { sources: selectedSources, limit, category } 
        : {
            sources: selectedSources,
            limit,
            rotationSeed: Date.now(),
            excludeLinks: (() => {
              try {
                const saved = JSON.parse(localStorage.getItem("caca_oferta_recent_coupon_links") || "[]");
                const current = offers.map((offer) => offer.link || offer.url).filter(Boolean);
                return Array.from(new Set([...(Array.isArray(saved) ? saved : []), ...current])).slice(-100);
              } catch {
                return offers.map((offer) => offer.link || offer.url).filter(Boolean);
              }
            })()
          };

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
        if (data.offers && data.offers.length > 0) {
          setOffers(data.offers);
          if (mode === "coupons") {
            try {
              const previous = JSON.parse(localStorage.getItem("caca_oferta_recent_coupon_links") || "[]");
              const next = Array.from(new Set([
                ...(Array.isArray(previous) ? previous : []),
                ...data.offers.map((offer: any) => offer.link || offer.url).filter(Boolean)
              ])).slice(-100);
              localStorage.setItem("caca_oferta_recent_coupon_links", JSON.stringify(next));
            } catch (error) {
              console.error("[localStorage] Erro ao salvar histórico de cupons:", error);
            }
          }
        } else {
          setOffers([]);
          router.refresh();
        }
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

  async function handleManualCouponSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualLoading(true);
    setManualResult(null);
    try {
      const response = await fetch("/api/coupons/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualCoupon)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const errors = Array.isArray(data.errors) ? data.errors.join(" ") : data.message;
        setManualResult({ success: false, message: errors || "Não foi possível cadastrar o cupom." });
        return;
      }
      setManualResult({ success: true, message: "Cupom cadastrado. O rascunho foi persistido com o resgate no marketplace." });
      setManualCoupon(emptyManualCoupon);
      router.refresh();
    } catch (error) {
      console.error("[MANUAL-COUPON] Erro no cadastro:", error);
      setManualResult({ success: false, message: "Erro de rede ao cadastrar o cupom." });
    } finally {
      setManualLoading(false);
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
              : "Cadastre manualmente cupons da Central de Afiliados. A busca pública só é usada quando houver fonte oficial disponível."}
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            {(Object.keys(sourceLabels) as Array<keyof typeof sourceLabels>).map((key) => {
              const couponState = couponAvailability[key];
              const isCouponSupported = couponState === "supported";
              const isProductSupported = productAvailability[key] === "supported";
              const disabledInMode = mode === "products" ? !isProductSupported : !isCouponSupported;
              const showMercadoLivreTooltip = mode === "coupons" && key === "mercadolivre";
              const helperText =
                disabledInMode
                  ? "Não disponível neste fluxo"
                  : null;

              return (
                <label
                  key={key}
                  title={showMercadoLivreTooltip ? mercadolivreCouponTooltip : undefined}
                  onClick={disabledInMode ? (e) => e.preventDefault() : undefined}
                  className={`flex items-center gap-2 text-sm font-medium ${disabledInMode ? "cursor-not-allowed text-white/35" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={sources[key]}
                    disabled={disabledInMode}
                    onChange={disabledInMode ? undefined : (e) => handleSourceChange(key, e.target.checked)}
                    className="rounded border-moss/20 text-moss focus:ring-moss h-4 w-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span>{sourceLabels[key]}</span>
                  {showMercadoLivreTooltip ? (
                    <span
                      title={mercadolivreCouponTooltip}
                      className="inline-flex text-white/45"
                      aria-label="Informações sobre cupons do Mercado Livre"
                    >
                      <CircleAlert size={14} />
                    </span>
                  ) : null}
                  {helperText ? <span className="text-[11px] text-white/45">{helperText}</span> : null}
                </label>
              );
            })}
          </div>
          {mode === "coupons" ? (
            <p className="mt-2 text-[11px] text-white/45">
              Mercado Livre, Shopee e Amazon exigem código, regras, validade e link copiados da área oficial de afiliados.
            </p>
          ) : null}
          {mode === "coupons" ? (
            <form onSubmit={handleManualCouponSubmit} className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <h3 className="text-sm font-bold text-blue-200">Cadastrar cupom manualmente</h3>
              <p className="mt-1 text-[11px] text-white/50">Cole os dados exibidos na Central de Afiliados. O sistema não consulta nem inventa cupons.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <select
                  required
                  value={manualCoupon.marketplace}
                  onChange={(e) => setManualCoupon((prev) => ({ ...prev, marketplace: e.target.value }))}
                  className="bg-[#08131f] border border-moss/20 rounded-md text-sm text-white placeholder:text-white/40 px-3 py-2 outline-none [color-scheme:dark]"
                >
                  <option>Mercado Livre</option>
                  <option>Shopee</option>
                  <option>Amazon</option>
                </select>
                <input required value={manualCoupon.code} onChange={(e) => setManualCoupon((prev) => ({ ...prev, code: e.target.value }))} placeholder="Código ou RESGATE DIRETO" className="bg-[#08131f] border border-moss/20 rounded-md text-sm text-white placeholder:text-white/40 px-3 py-2 outline-none [color-scheme:dark]" />
                <input required value={manualCoupon.discount} onChange={(e) => setManualCoupon((prev) => ({ ...prev, discount: e.target.value }))} placeholder="Benefício (ex.: R$ 20 OFF)" className="bg-[#08131f] border border-moss/20 rounded-md text-sm text-white placeholder:text-white/40 px-3 py-2 outline-none [color-scheme:dark]" />
                <input required value={manualCoupon.validity} onChange={(e) => setManualCoupon((prev) => ({ ...prev, validity: e.target.value }))} placeholder="Validade (ex.: até 31/08/2026)" className="bg-[#08131f] border border-moss/20 rounded-md text-sm text-white placeholder:text-white/40 px-3 py-2 outline-none [color-scheme:dark]" />
                <input required type="url" value={manualCoupon.link} onChange={(e) => setManualCoupon((prev) => ({ ...prev, link: e.target.value }))} placeholder="Link oficial/afiliado que gera comissão" title="Use aqui o link de afiliado do produto ou cupom" className="bg-[#08131f] border border-moss/20 rounded-md text-sm text-white placeholder:text-white/40 px-3 py-2 outline-none [color-scheme:dark] md:col-span-2" />
                <input type="url" value={manualCoupon.imageUrl} onChange={(e) => setManualCoupon((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="URL direta da imagem (opcional; não use link Shopee/afiliado)" title="Cole o endereço direto do arquivo JPG, PNG ou WebP" className="bg-[#08131f] border border-moss/20 rounded-md text-sm text-white placeholder:text-white/40 px-3 py-2 outline-none [color-scheme:dark] md:col-span-2" />
                <textarea required value={manualCoupon.rules} onChange={(e) => setManualCoupon((prev) => ({ ...prev, rules: e.target.value }))} placeholder="Regras de uso (mínimo, categoria, canal etc.)" rows={2} className="bg-[#08131f] border border-moss/20 rounded-md text-sm text-white placeholder:text-white/40 px-3 py-2 outline-none [color-scheme:dark] md:col-span-2" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button type="submit" disabled={manualLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {manualLoading ? <><Loader2 className="animate-spin" size={16} /> Cadastrando...</> : "Cadastrar cupom"}
                </Button>
                {manualResult ? <span className={`text-xs ${manualResult.success ? "text-emerald-300" : "text-red-300"}`}>{manualResult.message}</span> : null}
              </div>
            </form>
          ) : null}
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

      {offers.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-white/80 mb-3 border-b border-white/10 pb-2">Resultados Obtidos ({offers.length})</h3>
          <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {offers.map((offer) => (
              <div key={offer.id || offer.candidateId} className="flex gap-4 p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-black/50 border border-white/10 relative">
                  {offer.image || offer.imageUrl ? (
                    <img src={offer.image || offer.imageUrl} alt={offer.title || offer.productName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px]">Sem foto</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                      {offer.marketplace}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">
                      {offer.category}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium text-white/90 truncate" title={offer.title || offer.productName}>
                    {offer.title || offer.productName}
                  </h4>
                  <div className="flex items-center gap-3 mt-1.5">
                    {mode === "coupons" ? (
                      <>
                        <span className="text-sm font-bold text-blue-300">{offer.discount || "Benefício oficial"}</span>
                        <span className="text-xs font-semibold text-white/70">{offer.code || "RESGATE DIRETO"}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-bold text-emerald-400">
                          R$ {Number(offer.price || offer.currentPrice || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        {(offer.score || offer.selectionScore) && (
                          <span className="text-xs text-white/50">
                            Score: {Math.round(offer.score || offer.selectionScore || 0)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {Array.isArray(offer.badges) && offer.badges.map((badge: string, i: number) => (
                      <span key={i} className="text-[9px] uppercase font-bold text-white/70 bg-white/10 px-1.5 py-0.5 rounded border border-white/10">
                        {badge}
                      </span>
                    ))}
                    {(offer.url || offer.affiliateLink) && (
                      <a 
                        href={offer.url || offer.affiliateLink} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[10px] text-emerald-400 hover:underline ml-auto"
                      >
                        Ver Produto ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
