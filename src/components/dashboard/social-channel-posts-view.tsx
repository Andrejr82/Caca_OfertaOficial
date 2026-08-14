"use client";

import { useEffect, useMemo, useState } from "react";
import { BatchApprovalList } from "@/components/dashboard/batch-approval-list";
import { PostHistoryTable } from "@/components/dashboard/post-history-table";
import { getCategoryOptions } from "@/lib/offers/category-taxonomy";
import { classifyOfferForPanel, UNCLASSIFIED_PANEL_CATEGORY } from "@/lib/offers/panel-category-filter";

type MarketplaceFilterKey =
  | "all"
  | "amazon"
  | "mercado-livre"
  | "shopee"
  | "magalu"
  | "shein"
  | "coupons";

interface PostOfferMetadata {
  platform?: string | null;
  marketplace?: string | null;
  category?: string | null;
  subcategory?: string | null;
  product_name?: string | null;
  source_categories?: unknown;
}

interface DraftPostItem {
  id: string;
  offers?: PostOfferMetadata | null;
}

interface HistoryPostItem {
  id: string;
  date: string;
  time: string;
  product: string;
  platform: string;
  marketplace?: string | null;
  category?: string | null;
  link: string;
  channel: string;
  status: string;
  clicks: number;
  conversions: number;
  revenue: number;
}

const MARKETPLACE_FILTERS: Array<{ key: MarketplaceFilterKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "amazon", label: "Amazon" },
  { key: "mercado-livre", label: "Mercado Livre" },
  { key: "shopee", label: "Shopee" },
  { key: "magalu", label: "Magalu" },
  { key: "shein", label: "Shein" },
  { key: "coupons", label: "Cupons" },
];

const FILTER_LABEL_BY_KEY: Record<Exclude<MarketplaceFilterKey, "all" | "coupons">, string> = {
  amazon: "Amazon",
  "mercado-livre": "Mercado Livre",
  shopee: "Shopee",
  magalu: "Magalu",
  shein: "Shein",
};

function normalizeValue(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesMarketplaceFilter(
  filter: MarketplaceFilterKey,
  offer: PostOfferMetadata | HistoryPostItem["marketplace"] | null | undefined,
  fallbackPlatform?: string | null,
  category?: string | null,
) {
  const normalizedCategory = normalizeValue(category);

  if (filter === "all") return true;
  if (filter === "coupons") return normalizedCategory === "cupons";

  const target = normalizeValue(FILTER_LABEL_BY_KEY[filter]);

  if (typeof offer === "object" && offer !== null) {
    return [offer.marketplace, offer.platform].some((value) => normalizeValue(value) === target);
  }

  return [offer, fallbackPlatform].some((value) => normalizeValue(value) === target);
}

export function SocialChannelPostsView<TDraftPost extends DraftPostItem>({
  channel,
  accentClassName,
  draftPosts,
  historyData,
}: {
  channel: "telegram" | "instagram" | "whatsapp" | "facebook";
  accentClassName: string;
  draftPosts: TDraftPost[];
  historyData: HistoryPostItem[];
}) {
  const [activeFilter, setActiveFilter] = useState<MarketplaceFilterKey>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [approvedDraftIds, setApprovedDraftIds] = useState<Set<string>>(new Set());
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const storageKey = `caca-oferta:panel-filters:social:${channel}:v1`;
  const selectedCategory = getCategoryOptions().find((category) => category.value === categoryFilter);

  function persistSocialFilters(next: {
    activeFilter?: MarketplaceFilterKey;
    categoryFilter?: string;
    subcategoryFilter?: string;
  }) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        activeFilter: next.activeFilter ?? activeFilter,
        categoryFilter: next.categoryFilter ?? categoryFilter,
        subcategoryFilter: next.subcategoryFilter ?? subcategoryFilter,
      }));
    } catch {
      // A filtragem continua funcionando mesmo se o armazenamento local estiver indisponível.
    }
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.activeFilter === "string") setActiveFilter(saved.activeFilter as MarketplaceFilterKey);
        if (typeof saved.categoryFilter === "string") setCategoryFilter(saved.categoryFilter);
        if (typeof saved.subcategoryFilter === "string") setSubcategoryFilter(saved.subcategoryFilter);
      }
    } catch {
      // Preferir filtros padrão se o armazenamento local estiver inválido.
    } finally {
      setFiltersHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!filtersHydrated) return;
    localStorage.setItem(storageKey, JSON.stringify({ activeFilter, categoryFilter, subcategoryFilter }));
  }, [filtersHydrated, storageKey, activeFilter, categoryFilter, subcategoryFilter]);

  const visibleDraftPosts = useMemo(
    () => draftPosts.filter((post) => !approvedDraftIds.has(post.id)),
    [approvedDraftIds, draftPosts],
  );

  const filterCounts = useMemo(() => {
    const uniquePosts = new Map<
      string,
      {
        platform?: string | null;
        marketplace?: string | null;
        category?: string | null;
      }
    >();

    for (const post of visibleDraftPosts) {
      uniquePosts.set(post.id, {
        platform: post.offers?.platform,
        marketplace: post.offers?.marketplace,
        category: post.offers?.category,
      });
    }

    return MARKETPLACE_FILTERS.reduce<Record<MarketplaceFilterKey, number>>((acc, filter) => {
      acc[filter.key] = Array.from(uniquePosts.values()).filter((post) =>
        matchesMarketplaceFilter(filter.key, post.marketplace, post.platform, post.category),
      ).length;
      return acc;
    }, {} as Record<MarketplaceFilterKey, number>);
  }, [visibleDraftPosts]);

  const filteredDraftPosts = useMemo(
    () =>
      visibleDraftPosts.filter((post) =>
        matchesMarketplaceFilter(activeFilter, post.offers, post.offers?.platform, post.offers?.category)
        && (!categoryFilter || classifyOfferForPanel(post.offers || {}).category === categoryFilter)
        && (!subcategoryFilter || classifyOfferForPanel(post.offers || {}).subcategory === subcategoryFilter),
      ),
    [activeFilter, categoryFilter, subcategoryFilter, visibleDraftPosts],
  );

  const filteredHistoryData = useMemo(
    () =>
      historyData.filter((post) =>
        matchesMarketplaceFilter(activeFilter, post.marketplace, post.platform, post.category)
        && (!categoryFilter || classifyOfferForPanel({ product: post.product, category: post.category }).category === categoryFilter),
      ),
    [activeFilter, categoryFilter, historyData],
  );

  const hasFilteredPosts = filteredDraftPosts.length > 0 || filteredHistoryData.length > 0;
  const isMarketplaceSpecificFilter = activeFilter !== "all";

  return (
    <>
      <section className="glass-card p-4">
        <div className="flex flex-wrap gap-2">
          {MARKETPLACE_FILTERS.map((filter) => {
            const active = filter.key === activeFilter;

            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  setActiveFilter(filter.key);
                  persistSocialFilters({ activeFilter: filter.key });
                }}
                className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-all ${
                  active
                    ? `${accentClassName} border-transparent text-white shadow-lg`
                    : "border-white/10 bg-white/[0.04] text-white/65 hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <span>{filter.label}</span>
                <span className="rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-bold text-inherit">
                  {filterCounts[filter.key]}
                </span>
              </button>
            );
          })}
          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setSubcategoryFilter("");
              persistSocialFilters({ categoryFilter: event.target.value, subcategoryFilter: "" });
            }}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/75"
          >
            <option value="">Todas as categorias</option>
            <option value={UNCLASSIFIED_PANEL_CATEGORY}>Sem classificação</option>
            {getCategoryOptions().map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
          <select
            value={subcategoryFilter}
            onChange={(event) => {
              setSubcategoryFilter(event.target.value);
              persistSocialFilters({ subcategoryFilter: event.target.value });
            }}
            disabled={!categoryFilter}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/75 disabled:opacity-40"
          >
            <option value="">Todas as subcategorias</option>
            {(selectedCategory?.subcategories || []).map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
          </select>
        </div>
      </section>

      {!hasFilteredPosts && isMarketplaceSpecificFilter && (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-white/60">Nenhum post encontrado para este marketplace.</p>
        </div>
      )}

      <section className="grid gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Aguardando Aprovação</h2>
          <span className={`grid h-5 min-w-5 place-items-center rounded-md px-1.5 text-[10px] font-extrabold ${accentClassName}`}>
            {filteredDraftPosts.length}
          </span>
        </div>
        <BatchApprovalList
          posts={filteredDraftPosts as any}
          channel={channel}
          onPostApproved={(postId) => setApprovedDraftIds((current) => new Set(current).add(postId))}
        />
      </section>

      <section className="grid gap-4">
        <PostHistoryTable
          initialData={filteredHistoryData}
          channelName={channel}
          showPlatformFilter={false}
          emptyMessage={isMarketplaceSpecificFilter ? "Nenhum post encontrado para este marketplace." : undefined}
        />
      </section>
    </>
  );
}
