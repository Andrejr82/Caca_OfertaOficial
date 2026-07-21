"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import type { Offer } from "@/types/domain";
import { rejectShopeeCandidateAction, selectShopeeCandidateAction } from "@/lib/offers/actions";
import { rejectMercadoLivreOfferAction, selectMercadoLivreOfferAction } from "@/lib/offers/actions";
import { rejectAmazonOfferAction, selectAmazonOfferAction, bulkRejectOffersAction } from "@/lib/offers/actions";
import { GenerateAIMessagesButton } from "@/components/messages/message-actions";
import { getCategoryOptions } from "@/lib/offers/category-taxonomy";
import { classifyOfferForPanel, classifyPanelEditorial, PANEL_AUDIENCES, PANEL_OFFER_TYPES, PANEL_POSTING_PROFILES, UNCLASSIFIED_PANEL_CATEGORY } from "@/lib/offers/panel-category-filter";

type OfferWithDraftCount = Offer & { draft_count?: number };
const OFFER_FILTER_STORAGE_KEY = "caca-oferta:panel-filters:offers:v1";

export function OffersClient({ initialOffers }: { initialOffers: OfferWithDraftCount[] }) {
  const [filterTier, setFilterTier] = useState<string>("");
  const [filterDecision, setFilterDecision] = useState<string>("");
  const [filterPlatform, setFilterPlatform] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterSubcategory, setFilterSubcategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [minDiscount, setMinDiscount] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterOfferType, setFilterOfferType] = useState<string>("");
  const [filterAudience, setFilterAudience] = useState<string>("");
  const [filterPostingProfile, setFilterPostingProfile] = useState<string>("");
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [sortBy, setSortBy] = useState<string>("date");
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(new Set());
  const [isDiscarding, startDiscarding] = useTransition();

  const selectedCategory = getCategoryOptions().find((category) => category.value === filterCategory);
  const availableSubcategories = selectedCategory?.subcategories || [];

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OFFER_FILTER_STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        setFilterTier(typeof saved.filterTier === "string" ? saved.filterTier : "");
        setFilterDecision(typeof saved.filterDecision === "string" ? saved.filterDecision : "");
        setFilterPlatform(typeof saved.filterPlatform === "string" ? saved.filterPlatform : "");
        setFilterCategory(typeof saved.filterCategory === "string" ? saved.filterCategory : "");
        setFilterSubcategory(typeof saved.filterSubcategory === "string" ? saved.filterSubcategory : "");
        setFilterStatus(typeof saved.filterStatus === "string" ? saved.filterStatus : "");
        setMinPrice(typeof saved.minPrice === "string" ? saved.minPrice : "");
        setMaxPrice(typeof saved.maxPrice === "string" ? saved.maxPrice : "");
        setMinDiscount(typeof saved.minDiscount === "string" ? saved.minDiscount : "");
        setFilterDate(typeof saved.filterDate === "string" ? saved.filterDate : "");
        setFilterOfferType(typeof saved.filterOfferType === "string" ? saved.filterOfferType : "");
        setFilterAudience(typeof saved.filterAudience === "string" ? saved.filterAudience : "");
        setFilterPostingProfile(typeof saved.filterPostingProfile === "string" ? saved.filterPostingProfile : "");
      }
    } catch {
      // Preferir filtros vazios se o armazenamento local estiver inválido.
    } finally {
      setFiltersHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!filtersHydrated) return;
    localStorage.setItem(OFFER_FILTER_STORAGE_KEY, JSON.stringify({
      filterTier, filterDecision, filterPlatform, filterCategory, filterSubcategory,
      filterStatus, minPrice, maxPrice, minDiscount, filterDate,
      filterOfferType, filterAudience, filterPostingProfile,
    }));
  }, [filtersHydrated, filterTier, filterDecision, filterPlatform, filterCategory, filterSubcategory, filterStatus, minPrice, maxPrice, minDiscount, filterDate, filterOfferType, filterAudience, filterPostingProfile]);

  // Ponytail: simplificando ordenação e filtro em memória, sem query params complexos.
  const filtered = initialOffers.filter(offer => {
    const expl = offer.explainability || {};
    const tier = expl.tier || "C";
    const decision = expl.aiDecision?.status || "N/A";
    
    if (filterTier && tier !== filterTier) return false;
    if (filterDecision && decision !== filterDecision) return false;
    if (filterPlatform && offer.platform !== filterPlatform) return false;
    const panelCategory = classifyOfferForPanel(offer);
    const editorial = classifyPanelEditorial(offer);
    if (filterCategory && panelCategory.category !== filterCategory) return false;
    if (filterSubcategory && panelCategory.subcategory !== filterSubcategory) return false;
    if (filterOfferType && !editorial.types.includes(filterOfferType)) return false;
    if (filterAudience && editorial.audience !== filterAudience) return false;
    if (filterPostingProfile && !editorial.profiles.includes(filterPostingProfile)) return false;
    if (filterStatus && offer.status !== filterStatus) return false;

    if (minPrice && offer.current_price < Number(minPrice)) return false;
    if (maxPrice && offer.current_price > Number(maxPrice)) return false;
    const discount = offer.old_price && offer.old_price > offer.current_price
      ? ((offer.old_price - offer.current_price) / offer.old_price) * 100
      : 0;
    if (minDiscount && discount < Number(minDiscount)) return false;
    if (filterDate) {
      const offerDate = new Date(offer.updated_at || offer.created_at).toISOString().slice(0, 10);
      if (offerDate !== filterDate) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const explA = a.explainability || {};
    const explB = b.explainability || {};
    
    if (sortBy === "priority") {
      const offB = explB.commercialComparison?.officialPolicy || b.score;
      const offA = explA.commercialComparison?.officialPolicy || a.score;
      return offB - offA;
    }
    if (sortBy === "commercial") {
      const compB = explB.commercialComparison?.commercialPolicy || 0;
      const compA = explA.commercialComparison?.commercialPolicy || 0;
      return compB - compA;
    }
    if (sortBy === "price") {
      return a.current_price - b.current_price;
    }
    if (sortBy === "tier") {
      const tiers = { "S": 5, "A": 4, "B": 3, "C": 2, "LIXO": 1, "N/A": 0 };
      return (tiers[(explB.tier || "C") as keyof typeof tiers] || 0) - (tiers[(explA.tier || "C") as keyof typeof tiers] || 0);
    }
    // date (default)
    const timeA = new Date(a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  });

  const selectableOffers = sorted.filter((offer) => offer.status === "pending_manual_review");
  const allSelectableSelected = selectableOffers.length > 0 && selectableOffers.every((offer) => selectedOfferIds.has(offer.id));

  function toggleOffer(offerId: string) {
    setSelectedOfferIds((current) => {
      const next = new Set(current);
      if (next.has(offerId)) next.delete(offerId); else next.add(offerId);
      return next;
    });
  }

  function toggleAllOffers() {
    setSelectedOfferIds((current) => {
      const next = new Set(current);
      if (allSelectableSelected) selectableOffers.forEach((offer) => next.delete(offer.id));
      else selectableOffers.forEach((offer) => next.add(offer.id));
      return next;
    });
  }

  function discardSelectedOffers() {
    if (selectedOfferIds.size === 0) return;
    if (!window.confirm(`Descartar ${selectedOfferIds.size} oferta(s) selecionada(s)?`)) return;
    const formData = new FormData();
    formData.set("offer_ids", JSON.stringify([...selectedOfferIds]));
    startDiscarding(async () => {
      await bulkRejectOffersAction(formData);
      setSelectedOfferIds(new Set());
    });
  }

  return (
    <section className="glass-card p-5 w-full flex flex-col gap-4">
      <div className="grid gap-3 border-b border-white/[0.04] pb-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="inline-flex items-center gap-2 rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
          <input type="checkbox" checked={allSelectableSelected} onChange={toggleAllOffers} disabled={selectableOffers.length === 0 || isDiscarding} />
          Selecionar todos
        </label>
        <button type="button" onClick={discardSelectedOffers} disabled={selectedOfferIds.size === 0 || isDiscarding} className="rounded border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 disabled:cursor-not-allowed disabled:opacity-40">
          {isDiscarding ? "Descartando..." : `Descartar selecionados${selectedOfferIds.size ? ` (${selectedOfferIds.size})` : ""}`}
        </button>
        <select
          className="bg-black/20 text-white text-sm rounded p-2"
          value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
        >
          <option value="">Todos Marketplaces</option>
          <option value="Shopee">Shopee</option>
          <option value="Amazon">Amazon</option>
          <option value="Mercado Livre">Mercado Livre</option>
          <option value="Magalu">Magalu</option>
        </select>

        <select
          className="rounded bg-black/20 p-2 text-sm text-white"
          value={filterCategory}
          onChange={(event) => { setFilterCategory(event.target.value); setFilterSubcategory(""); }}
        >
          <option value="">Todas as categorias</option>
          <option value={UNCLASSIFIED_PANEL_CATEGORY}>Sem classificação</option>
          {getCategoryOptions().map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
        </select>

        <select
          className="rounded bg-black/20 p-2 text-sm text-white disabled:opacity-40"
          value={filterSubcategory}
          onChange={(event) => setFilterSubcategory(event.target.value)}
          disabled={!filterCategory}
        >
          <option value="">Todas as subcategorias</option>
          {availableSubcategories.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
        </select>

        <select 
          className="bg-black/20 text-white text-sm rounded p-2"
          value={filterTier} onChange={e => setFilterTier(e.target.value)}
        >
          <option value="">Todos Tiers</option>
          <option value="S">Tier S</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
          <option value="LIXO">Tier LIXO</option>
        </select>

        <select
          className="rounded bg-black/20 p-2 text-sm text-white"
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="pending_manual_review">Em revisão</option>
          <option value="selected">Selecionadas</option>
          <option value="approved">Aprovadas</option>
          <option value="posted">Publicadas</option>
          <option value="rejected">Descartadas</option>
        </select>

        <input className="rounded bg-black/20 p-2 text-sm text-white" type="number" min="0" step="0.01" placeholder="Preço mínimo" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} />
        <input className="rounded bg-black/20 p-2 text-sm text-white" type="number" min="0" step="0.01" placeholder="Preço máximo" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
        <input className="rounded bg-black/20 p-2 text-sm text-white" type="number" min="0" max="100" placeholder="Desconto mínimo (%)" value={minDiscount} onChange={(event) => setMinDiscount(event.target.value)} />
        <select className="rounded bg-black/20 p-2 text-sm text-white" value={filterOfferType} onChange={(event) => setFilterOfferType(event.target.value)}>
          <option value="">Todos os tipos de oferta</option>
          {PANEL_OFFER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select className="rounded bg-black/20 p-2 text-sm text-white" value={filterAudience} onChange={(event) => setFilterAudience(event.target.value)}>
          <option value="">Todos os públicos</option>
          {PANEL_AUDIENCES.map((audience) => <option key={audience} value={audience}>{audience}</option>)}
        </select>
        <select className="rounded bg-black/20 p-2 text-sm text-white" value={filterPostingProfile} onChange={(event) => setFilterPostingProfile(event.target.value)}>
          <option value="">Todos os perfis de postagem</option>
          {PANEL_POSTING_PROFILES.map((profile) => <option key={profile} value={profile}>{profile}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded bg-black/20 px-2 text-xs text-white/50">
          Data exata
          <input className="min-w-0 flex-1 bg-transparent p-2 text-sm text-white" type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} />
        </label>

        <select 
          className="bg-black/20 text-white text-sm rounded p-2"
          value={filterDecision} onChange={e => setFilterDecision(e.target.value)}
        >
          <option value="">Todas Decisões</option>
          <option value="APPROVE">APPROVE</option>
          <option value="REVIEW">REVIEW</option>
          <option value="REJECT">REJECT</option>
        </select>

        <select 
          className="bg-black/20 text-white text-sm rounded p-2"
          value={sortBy} onChange={e => setSortBy(e.target.value)}
        >
          <option value="date">Ordernar: Data</option>
          <option value="priority">Ordernar: Priority Score</option>
          <option value="commercial">Ordernar: Commercial Score</option>
          <option value="price">Ordernar: Preço</option>
          <option value="tier">Ordernar: Tier</option>
        </select>
      </div>

      <div className="space-y-4">
        {sorted.length ? sorted.map((offer, index) => {
          const expl = offer.explainability || {};
          const tier = expl.tier || "C";
          const quality = expl.quality?.status || "N/A";
          const dedup = expl.deduplication?.status || "N/A";
          const aiDecision = expl.aiDecision?.status || "N/A";
          
          const comp = expl.commercialComparison;
          const officialScore = comp?.officialPolicy || offer.score;
          const commercialScore = comp?.commercialPolicy || 0;
          const delta = comp?.delta || 0;
          const deltaLevel = comp?.deltaLevel || "LOW";
          const changed = comp?.changed || false;
          const confidence = comp?.confidence || "N/A";
          const qualityObj = expl.commercialQuality || { status: "COMUM", confidence: "N/A" };
          const qualityBadge = qualityObj.status || "COMUM";
          const qualityConf = qualityObj.confidence || "N/A";
          
          const decision = changed ? "CHANGED" : "UNCHANGED";
          const editorial = classifyPanelEditorial(offer);
          
          const badges = expl.signals || [];
          const reason = comp?.reasons?.join(" | ") || expl.aiDecision?.reason || expl.quality?.reason || "N/A";
          const nativeShopee = offer.platform === "Shopee" && Boolean(offer.shopee_product_cat_id);
          const metrics = offer.marketplace_metrics || {};
          const transitionRequestedAt = offer.updated_at || offer.created_at;
          const draftCount = (offer as OfferWithDraftCount).draft_count || 0;
          const hasDraftsReady = offer.status === "pending_manual_review" && draftCount > 0;

          const tierColor = 
            tier === "S" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" :
            tier === "A" ? "text-green-400 bg-green-400/10 border-green-400/20" :
            tier === "B" ? "text-blue-400 bg-blue-400/10 border-blue-400/20" :
            tier === "C" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" :
            "text-red-400 bg-red-400/10 border-red-400/20";

          return (
            <div key={offer.id} className="border border-white/[0.05] rounded-lg p-4 bg-white/[0.01] flex flex-col gap-3">
              <div className="flex justify-between items-start gap-4">
                <input
                  type="checkbox"
                  aria-label={`Selecionar oferta ${offer.product_name}`}
                  checked={selectedOfferIds.has(offer.id)}
                  onChange={() => toggleOffer(offer.id)}
                  disabled={offer.status !== "pending_manual_review" || isDiscarding}
                  className="mt-1 h-4 w-4 shrink-0 accent-red-500 disabled:opacity-30"
                />
                {offer.image_url && (
                  <img src={offer.image_url} alt="" className="h-20 w-20 rounded-md object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${tierColor}`}>Tier {tier}</span>
                    <Badge label={offer.platform} />
                    {hasDraftsReady && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded border text-violet-300 bg-violet-500/10 border-violet-500/20">
                        ✦ {draftCount} draft{draftCount !== 1 ? "s" : ""} prontos
                      </span>
                    )}
                    {badges.map((b: string) => <Badge key={b} label={b.replace(/_/g, " ")} tone="neutral" />)}
                    {editorial.types.slice(0, 3).map((type) => <Badge key={type} label={type} tone="future" />)}
                  </div>
                  <p className="text-sm font-semibold text-white/90 truncate">{offer.product_name}</p>
                  <p className="text-[11px] text-white/40">
                    {offer.category || "Sem categoria"}{offer.subcategory ? ` / ${offer.subcategory}` : ""}
                    {nativeShopee ? ` • Top ${offer.native_category_position} • productCatId ${offer.shopee_product_cat_id}` : ""}
                    {` • R$ ${offer.current_price}`}
                    {offer.old_price ? ` (de R$ ${offer.old_price})` : ""}
                  </p>
                  {nativeShopee && (
                    <p className="mt-1 text-[11px] text-white/55">
                      Vendas: {metrics.sales ?? 0} • Desconto: {metrics.discount ?? 0}% • Avaliação: {metrics.rating ?? "N/A"} • Comissão: {offer.commission_rate ?? 0}% • Seller: {metrics.seller || "N/A"}
                    </p>
                  )}
                  {offer.platform === "Mercado Livre" && <p className="text-[11px] text-white/40">Posição {offer.source_position ?? "—"} • {offer.seller_name || "Seller não informado"} • {offer.shipping_free ? "Frete grátis" : "Frete não informado"}</p>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/40 mb-1">Official Policy / Commercial Policy</div>
                  <div className="flex items-center justify-end gap-2 text-sm font-bold">
                    <span className="text-white/80">{officialScore}</span>
                    <span className="text-white/30">/</span>
                    <span className={changed ? (delta > 0 ? "text-emerald-400" : "text-red-400") : "text-white/80"}>
                      {commercialScore}
                    </span>
                  </div>
                  {changed && (
                    <div className="text-[10px] mt-1 text-white/50">
                      Delta: {delta > 0 ? `+${delta}` : delta} ({deltaLevel})
                    </div>
                  )}
                  <div className="mt-1 text-[10px] uppercase font-bold text-blue-300">
                    Quality: {qualityBadge} ({qualityConf})
                  </div>
                  <div className={`mt-1 text-[10px] font-bold ${changed ? "text-yellow-400" : "text-white/30"}`}>
                    Decision: {decision}
                  </div>
                </div>
              </div>

              <div className="text-xs text-white/50 bg-black/20 p-2 rounded">
                <span className="font-semibold">Reason:</span> {reason}
              </div>

              {nativeShopee && offer.status === "pending_manual_review" && (
                <div className="flex gap-2 flex-wrap items-center">
                  <form action={selectShopeeCandidateAction}>
                    <input type="hidden" name="offer_id" value={offer.id} />
                    <input type="hidden" name="command_id" value={`curation:${offer.id}:select:${transitionRequestedAt}`} />
                    <input type="hidden" name="requested_at" value={transitionRequestedAt} />
                    <button className="rounded bg-emerald-500 px-3 py-2 text-xs font-bold text-black" type="submit">Selecionar</button>
                  </form>
                  <form action={rejectShopeeCandidateAction}>
                    <input type="hidden" name="offer_id" value={offer.id} />
                    <input type="hidden" name="command_id" value={`curation:${offer.id}:reject:${transitionRequestedAt}`} />
                    <input type="hidden" name="requested_at" value={transitionRequestedAt} />
                    <button className="rounded border border-red-400/40 px-3 py-2 text-xs font-bold text-red-300" type="submit">Descartar</button>
                  </form>
                  {/* ADR-014: Official AI Modo 1 — gera drafts sem alterar estado da offer */}
                  <GenerateAIMessagesButton offerId={offer.id} hasDrafts={hasDraftsReady} />
                  <a className="ml-auto text-xs text-blue-300 underline" href={offer.original_url} target="_blank" rel="noreferrer">Abrir produto</a>
                </div>
              )}

              {offer.platform === "Mercado Livre" && offer.status === "pending_manual_review" && (
                <div className="flex gap-2 flex-wrap items-center">
                  <form action={selectMercadoLivreOfferAction}><input type="hidden" name="offer_id" value={offer.id} /><input type="hidden" name="command_id" value={`curation:${offer.id}:select:${transitionRequestedAt}`} /><input type="hidden" name="requested_at" value={transitionRequestedAt} /><button className="rounded bg-emerald-500 px-3 py-1 text-xs font-bold text-black">Selecionar</button></form>
                  <form action={rejectMercadoLivreOfferAction}><input type="hidden" name="offer_id" value={offer.id} /><input type="hidden" name="command_id" value={`curation:${offer.id}:reject:${transitionRequestedAt}`} /><input type="hidden" name="requested_at" value={transitionRequestedAt} /><button className="rounded bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300">Descartar</button></form>
                  {/* ADR-014: Official AI Modo 1 */}
                  <GenerateAIMessagesButton offerId={offer.id} hasDrafts={hasDraftsReady} />
                </div>
              )}

              {offer.platform === "Amazon" && offer.status === "pending_manual_review" && (
                <div className="flex gap-2 flex-wrap items-center">
                  <form action={selectAmazonOfferAction}><input type="hidden" name="offer_id" value={offer.id} /><input type="hidden" name="command_id" value={`curation:${offer.id}:select:${transitionRequestedAt}`} /><input type="hidden" name="requested_at" value={transitionRequestedAt} /><button className="rounded bg-emerald-500 px-3 py-1 text-xs font-bold text-black">Selecionar</button></form>
                  <form action={rejectAmazonOfferAction}><input type="hidden" name="offer_id" value={offer.id} /><input type="hidden" name="command_id" value={`curation:${offer.id}:reject:${transitionRequestedAt}`} /><input type="hidden" name="requested_at" value={transitionRequestedAt} /><button className="rounded bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300">Descartar</button></form>
                  {/* ADR-014: Official AI Modo 1 */}
                  <GenerateAIMessagesButton offerId={offer.id} hasDrafts={hasDraftsReady} />
                </div>
              )}

              {/* Timeline Horizontal */}
              <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-white/40 overflow-x-auto pb-1">
                <span>Extracted</span>
                <span>→</span>
                <span className={quality === "APPROVED" ? "text-green-400" : quality === "REJECTED" ? "text-red-400" : ""}>Qual: {quality}</span>
                <span>→</span>
                <span className="text-blue-400">Rank</span>
                <span>→</span>
                <span className={tier === "S" ? "text-emerald-400" : ""}>Intell</span>
                <span>→</span>
                <span className={dedup === "UNIQUE" ? "text-green-400" : dedup === "DUPLICATE" ? "text-yellow-400" : ""}>Dedup: {dedup}</span>
                <span>→</span>
                <span className={aiDecision === "APPROVE" ? "text-green-400" : aiDecision === "REJECT" ? "text-red-400" : ""}>AI: {aiDecision}</span>
                <span>→</span>
                <span className={offer.status === "approved" || offer.status === "posted" ? "text-green-400" : ""}>Pub: {offer.status}</span>
              </div>
            </div>
          );
        }) : (
          <p className="py-6 text-center text-sm text-white/30">Nenhuma oferta atende aos filtros.</p>
        )}
      </div>
    </section>
  );
}
