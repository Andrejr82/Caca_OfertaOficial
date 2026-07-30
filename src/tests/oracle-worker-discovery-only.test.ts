import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const workerSource = readFileSync(resolve(process.cwd(), "scripts/oracle-scraper.cjs"), "utf8");

function functionSource(name: string): string {
  const start = workerSource.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`Função ausente: ${name}`);
  const next = workerSource.indexOf("\nasync function ", start + 1);
  return workerSource.slice(start, next < 0 ? workerSource.length : next);
}

describe("PMAV5-005 Oracle Worker Discovery-Only", () => {
  it("emite eventos correlacionados sem alterar o resultado", async () => {
    const { FINAL_STATE, runDiscoveryOnlyCycle } = require("../../scripts/oracle-worker-discovery-only.cjs");
    const events: Array<Record<string, unknown>> = [];
    const result = await runDiscoveryOnlyCycle({
      tenantId: "tenant-1",
      correlationId: "correlation-observed",
      requestedAt: "2026-07-14T12:00:00.000Z",
      discover: async () => [],
      persist: async () => ({ state: FINAL_STATE, accepted: 0 }),
      observe: async (event: Record<string, unknown>) => { events.push(event); }
    });

    expect(result.finalState).toBe(FINAL_STATE);
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "discovery.started", "discovery.marketplace.started",
      "discovery.marketplace.completed", "discovery.completed", "worker.heartbeat"
    ]));
    expect(events.every((event) => event.correlationId === "correlation-observed")).toBe(true);
  });

  it("rejeita Candidate V1 com preço original inferior ao preço atual", () => {
    const { createCandidateV1 } = require("../../scripts/oracle-worker-discovery-only.cjs");
    expect(() => createCandidateV1({
      marketplace: "Amazon",
      tenantId: "00000000-0000-4000-8000-000000000001",
      correlationId: "cycle-pmav5-005",
      product: {
        sourceItemId: "B000000001",
        sourceUrl: "https://www.amazon.com.br/dp/B000000001",
        title: "Oferta Amazon",
        imageUrl: "https://example.com/item.jpg",
        currentPrice: 100,
        originalPrice: 90,
        category: { id: "cat-1", name: "Categoria Oficial", source: "official" },
        marketplaceMetrics: { sourcePosition: 1 },
        deterministicScore: 8,
        discoveredAt: "2026-07-13T12:00:00.000Z",
      },
    })).toThrow("originalPrice");
  });

  it("orquestra somente os três discoveries nativos e persiste Ingestion V1", async () => {
    const {
      MARKETPLACES,
      runDiscoveryOnlyCycle,
    } = require("../../scripts/oracle-worker-discovery-only.cjs");

    const discover = vi.fn(async (marketplace: string) => [{
      sourceItemId: `${marketplace}-item-1`,
      sourceUrl: "https://example.com/item-1",
      title: `Oferta ${marketplace}`,
      imageUrl: "https://example.com/item-1.jpg",
      currentPrice: 99.9,
      originalPrice: 129.9,
      category: { id: `cat-${marketplace}`, name: `Categoria ${marketplace}`, source: "official" },
      marketplaceMetrics: marketplace === "Shopee"
        ? { sourcePosition: 1, shopee_item_id: "1001", shop_id: "2001" }
        : marketplace === "Mercado Livre"
          ? { sourcePosition: 1, item_id: "MLB1001" }
          : { sourcePosition: 1, asin: "B000000001" },
      deterministicScore: 8.5,
      discoveredAt: "2026-07-13T12:00:00.000Z",
    }]);
    const persist = vi.fn(async (ingestion: unknown) => ({
      accepted: 1,
      state: "pending_manual_review",
      ingestion,
    }));

    const result = await runDiscoveryOnlyCycle({
      tenantId: "00000000-0000-4000-8000-000000000001",
      correlationId: "cycle-pmav5-005",
      requestedAt: "2026-07-13T12:00:00.000Z",
      discover,
      persist,
    });

    expect(MARKETPLACES).toEqual(["Shopee", "Mercado Livre", "Amazon"]);
    expect(discover.mock.calls.map(([marketplace]) => marketplace)).toEqual(MARKETPLACES);
    expect(persist.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.marketplaces).toHaveLength(3);
    expect(result.finalState).toBe("pending_manual_review");

    for (const [ingestionsRaw] of persist.mock.calls) {
      const ingestions = ingestionsRaw as any[];
      expect(ingestions).toHaveLength(1);
      expect(ingestions[0]).toMatchObject({
        contractVersion: "pmav5.ingestion/v1",
        sourceType: "oracle_candidate",
        actor: { type: "service", id: "oracle-worker" },
        candidate: {
          contractVersion: "pmav5.candidate/v1",
          deterministicScore: 8.5,
        },
      });
    }
  });

  it("falha fechado se a persistência tentar encerrar em outro estado", async () => {
    const { runDiscoveryOnlyCycle } = require("../../scripts/oracle-worker-discovery-only.cjs");
    await expect(runDiscoveryOnlyCycle({
      tenantId: "00000000-0000-4000-8000-000000000001",
      correlationId: "cycle-pmav5-005",
      requestedAt: "2026-07-13T12:00:00.000Z",
      discover: async () => [{
        sourceItemId: "B000000001",
        sourceUrl: "https://www.amazon.com.br/dp/B000000001",
        title: "Oferta Amazon Válida",
        imageUrl: "https://example.com/item.jpg",
        currentPrice: 99.9,
        originalPrice: 129.9,
        category: { id: "cat-1", name: "Categoria Oficial", source: "official" },
        marketplaceMetrics: { sourcePosition: 1, asin: "B000000001" },
        deterministicScore: 8.5,
        discoveredAt: "2026-07-13T12:00:00.000Z",
      }],
      persist: async () => ({ accepted: 0, state: "selected" }),
    })).rejects.toThrow("pending_manual_review");
  });

  it("isola Candidate inválido e continua os marketplaces seguintes", async () => {
    const { runDiscoveryOnlyCycle } = require("../../scripts/oracle-worker-discovery-only.cjs");
    const persist = vi.fn(async (ingestions: unknown[]) => ({
      accepted: ingestions.length,
      state: "pending_manual_review",
    }));
    const valid = {
      sourceItemId: "item-1",
      sourceUrl: "https://example.com/item-1",
      title: "Oferta válida",
      imageUrl: "https://example.com/item-1.jpg",
      currentPrice: 99.9,
      originalPrice: 129.9,
      category: { id: "cat-1", name: "Categoria Oficial", source: "official" },
      marketplaceMetrics: { sourcePosition: 1, shopee_item_id: "1001", shop_id: "2001" },
      deterministicScore: 8.5,
      discoveredAt: "2026-07-13T12:00:00.000Z",
    };

    const result = await runDiscoveryOnlyCycle({
      tenantId: "00000000-0000-4000-8000-000000000001",
      correlationId: "cycle-pmav5-005",
      requestedAt: "2026-07-13T12:00:00.000Z",
      discover: async (marketplace: string) => marketplace === "Shopee"
        ? [{ ...valid, sourceItemId: "invalid", imageUrl: null }]
        : [{
          ...valid,
          category: { id: `cat-${marketplace}`, name: `Categoria ${marketplace}`, source: "official" },
          marketplaceMetrics: marketplace === "Mercado Livre"
            ? { sourcePosition: 1, item_id: "MLB1001" }
            : { sourcePosition: 1, asin: "B000000001" },
        }],
      persist,
    });

    expect(persist.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.marketplaces).toMatchObject([
      { marketplace: "Shopee", discovered: 1, rejected: 1, persisted: 0 },
      { marketplace: "Mercado Livre", rejected: 0, persisted: 1 },
      { marketplace: "Amazon", rejected: 0, persisted: 1 },
    ]);
  });

  it("deduplica globalmente o mesmo item de origem antes da Ingestion V1", async () => {
    const { runDiscoveryOnlyCycle } = require("../../scripts/oracle-worker-discovery-only.cjs");
    const product = {
      sourceItemId: "B000000001",
      sourceUrl: "https://www.amazon.com.br/dp/B000000001",
      title: "Oferta Amazon",
      imageUrl: "https://example.com/item.jpg",
      currentPrice: 100,
      originalPrice: 120,
      category: { id: "node-1", name: "Subcategoria 1", source: "Amazon Best Sellers" },
      marketplaceMetrics: { sourcePosition: 1 },
      deterministicScore: 8,
      discoveredAt: "2026-07-13T12:00:00.000Z",
    };
    const persisted: unknown[][] = [];
    const result = await runDiscoveryOnlyCycle({
      tenantId: "00000000-0000-4000-8000-000000000001",
      correlationId: "cycle-pmav5-005",
      requestedAt: "2026-07-13T12:00:00.000Z",
      discover: async (marketplace: string) => marketplace === "Amazon"
        ? [product, { ...product, category: { ...product.category, id: "node-2" } }]
        : [],
      persist: async (ingestions: unknown[]) => {
        persisted.push(ingestions);
        return { accepted: ingestions.length, state: "pending_manual_review" };
      },
    });
    expect(persisted[0]).toHaveLength(1);
    expect(result.marketplaces[2]).toMatchObject({
      marketplace: "Amazon",
      discovered: 2,
      duplicatesRejected: 1,
      persisted: 1,
    });
  });

  it("remove IA, drafts, posts, publicação e pipelines legados do ciclo executável", () => {
    const cycle = functionSource("runScrapingCycle");
    const store = functionSource("scrapeStore");

    for (const forbidden of [
      "processTopOffers",
      "pendingDrafts",
      "generateOfferAnalysis",
      "callLLM",
      "Groq",
      "Cerebras",
      "draft",
      "post",
      "publish",
      "selected",
      "approved",
      "posted",
    ]) {
      expect(cycle).not.toContain(forbidden);
    }

    for (const forbidden of [
      "runShopeeOfficialPipeline",
      "fetchShopeeOfficialDiscovery",
      "EPIC09",
      "runMarketplaceSelectionEngine",
      "createMarketplaceCandidateQueue",
      "fetchAmazonDiscoveryV3",
    ]) {
      expect(store).not.toContain(forbidden);
    }

    expect(store).toContain("executeShopeeNativeDiscoveryV5");
    expect(store).toContain("runMercadoLivreOfficialIntentCoverage");
    expect(store).not.toContain("runMercadoLivreNativeTop20");
    expect(store).toContain("runAmazonNativeTop20");
  });

  it("não exige credencial de LLM para iniciar o Worker", () => {
    expect(workerSource).not.toContain("hasAtLeastOneLLM");
    expect(workerSource).not.toMatch(/Missing required API keys[^\n]*LLM/i);
  });

  it("rejeita flags retiradas em vez de cair no ciclo persistente", () => {
    expect(workerSource).toContain("RETIRED_WORKER_FLAGS");
    for (const flag of [
      "--amazon-official-dry-run",
      "--discovery-dry-run",
      "--shopee-official-dry-run",
      "--shopee-v4-dry-run",
    ]) {
      expect(workerSource).toContain(flag);
    }
    expect(workerSource).toContain("Modo legado desativado no Oracle Worker Discovery-Only");
  });

  it("encerra com erro ao receber uma flag legada", () => {
    const execution = spawnSync(process.execPath, [
      resolve(process.cwd(), "scripts/oracle-scraper.cjs"),
      "--shopee-v4-dry-run",
    ], {
      encoding: "utf8",
      timeout: 20_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-only-key",
      },
    });
    expect(execution.status).toBe(1);
    expect(`${execution.stdout}${execution.stderr}`).toContain(
      "Modo legado desativado no Oracle Worker Discovery-Only: --shopee-v4-dry-run",
    );
  });

  it("não encerra consumidor externo que apenas importa o módulo", () => {
    const modulePath = resolve(process.cwd(), "scripts/oracle-scraper.cjs");
    const execution = spawnSync(process.execPath, [
      "-e",
      `process.argv.push('--shopee-v4-dry-run'); require(${JSON.stringify(modulePath)}); process.stdout.write('imported');`,
    ], {
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-only-key",
      },
    });
    expect(execution.status).toBe(0);
    expect(execution.stdout).toContain("imported");
  }, 25_000);

  it("notifica oficialmente trabalho pendente (notifyWorkPending) quando ofertas são persistidas em pending_manual_review", async () => {
    const { runDiscoveryOnlyCycle, FINAL_STATE } = require("../../scripts/oracle-worker-discovery-only.cjs");
    const notifyWorkPending = vi.fn().mockResolvedValue({ ok: true });
    const valid = {
      sourceItemId: "item-notify-1",
      sourceUrl: "https://example.com/item-notify-1",
      title: "Oferta para Notificação",
      imageUrl: "https://example.com/item-notify-1.jpg",
      currentPrice: 50.0,
      originalPrice: 80.0,
      category: { id: "cat-1", name: "Categoria Oficial", source: "official" },
      marketplaceMetrics: { sourcePosition: 1, shopee_item_id: "1001", shop_id: "2001" },
      deterministicScore: 9.0,
      discoveredAt: "2026-07-13T12:00:00.000Z",
    };

    const result = await runDiscoveryOnlyCycle({
      tenantId: "00000000-0000-4000-8000-000000000001",
      correlationId: "cycle-pmav5-notify",
      requestedAt: "2026-07-13T12:00:00.000Z",
      discover: async (marketplace: string) => marketplace === "Shopee" ? [valid] : [],
      persist: async (ingestions: unknown[]) => ({
        accepted: ingestions.length,
        persisted: ingestions.length,
        offerIds: ingestions.length ? ["offer-cycle-1", "offer-cycle-1"] : [],
        state: "pending_manual_review"
      }),
      notifyWorkPending,
    });

    expect(result.finalState).toBe(FINAL_STATE);
    expect(result.offerIds).toEqual(["offer-cycle-1"]);
    expect(notifyWorkPending).toHaveBeenCalledTimes(1);
    expect(notifyWorkPending).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: "cycle-pmav5-notify",
      offerIds: ["offer-cycle-1"]
    }));
  });

  it("não notifica a Official AI sem IDs reais materializados", async () => {
    const { runDiscoveryOnlyCycle } = require("../../scripts/oracle-worker-discovery-only.cjs");
    const notifyWorkPending = vi.fn();
    await runDiscoveryOnlyCycle({
      tenantId: "00000000-0000-4000-8000-000000000001",
      correlationId: "cycle-without-ids",
      requestedAt: "2026-07-15T12:00:00.000Z",
      discover: async () => [],
      persist: async () => ({ accepted: 0, offerIds: [], state: "pending_manual_review" }),
      notifyWorkPending
    });
    expect(notifyWorkPending).not.toHaveBeenCalled();
  });

  it("disparo pós-Discovery usa PROCESS_OFFERS e nunca ALL_PENDING", () => {
    const notify = functionSource("notifyWorkPendingToOfficialAI");
    expect(notify).toContain("PROCESS_OFFERS");
    expect(notify).toContain("cycleResult.offerIds");
    expect(notify).toContain("batchCompleted");
    expect(notify).toContain("totalPages");
    expect(notify).toContain("visitedPages");
    expect(notify).not.toContain("ALL_PENDING");
  });

  it("persistência usa o RPC v2 e acumula os UUIDs materializados", () => {
    const persist = functionSource("persistDiscoveryIngestionV1");
    expect(persist).toContain("upsert_discovery_offers_v2");
    expect(persist).toContain("data.offer_ids");
    expect(persist).toContain("offerIds");
  });
});
