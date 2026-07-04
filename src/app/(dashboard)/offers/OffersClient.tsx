"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Offer } from "@/types/domain";

export function OffersClient({ initialOffers }: { initialOffers: Offer[] }) {
  const [filterTier, setFilterTier] = useState<string>("");
  const [filterDecision, setFilterDecision] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("date");

  // Ponytail: simplificando ordenação e filtro em memória, sem query params complexos.
  const filtered = initialOffers.filter(offer => {
    const expl = offer.explainability || {};
    const tier = expl.tier || "C";
    const decision = expl.aiDecision?.status || "N/A";
    
    if (filterTier && tier !== filterTier) return false;
    if (filterDecision && decision !== filterDecision) return false;
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
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <section className="glass-card p-5 w-full flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 border-b border-white/[0.04] pb-4">
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
          
          const badges = expl.signals || [];
          const reason = comp?.reasons?.join(" | ") || expl.aiDecision?.reason || expl.quality?.reason || "N/A";

          const tierColor = 
            tier === "S" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" :
            tier === "A" ? "text-green-400 bg-green-400/10 border-green-400/20" :
            tier === "B" ? "text-blue-400 bg-blue-400/10 border-blue-400/20" :
            tier === "C" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" :
            "text-red-400 bg-red-400/10 border-red-400/20";

          return (
            <div key={offer.id} className="border border-white/[0.05] rounded-lg p-4 bg-white/[0.01] flex flex-col gap-3">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${tierColor}`}>Tier {tier}</span>
                    <Badge label={offer.platform} />
                    {badges.map((b: string) => <Badge key={b} label={b.replace(/_/g, " ")} tone="neutral" />)}
                  </div>
                  <p className="text-sm font-semibold text-white/90 truncate">{offer.product_name}</p>
                  <p className="text-[11px] text-white/40">{offer.category || "Sem categoria"} • R$ {offer.current_price}</p>
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
