import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routePath = path.join(process.cwd(), "src/app/api/trends/approval-queue/execute/route.ts");
const buttonPath = path.join(process.cwd(), "src/components/trends/daily-radar-refresh-button.tsx");
const pagePath = path.join(process.cwd(), "src/app/(dashboard)/trends/page.tsx");
const queuePath = path.join(process.cwd(), "src/components/trends/trend-approval-queue.tsx");

describe("Trend approval queue route contract", () => {
  it("mantém um clique para Radar e preparação da fila", () => {
    const source = fs.readFileSync(buttonPath, "utf8");
    expect(source).toContain('fetch("/api/trends/execute?refresh=1"');
    expect(source).toContain('fetch("/api/trends/approval-queue/execute"');
    expect(source).toContain("runId: radar.runId");
    expect(source).toContain("Shopee:");
    expect(source).toContain("Mercado Livre:");
  });

  it("exige Radar concluído do usuário antes da descoberta e persistência", () => {
    const source = fs.readFileSync(routePath, "utf8");
    expect(source).toContain("client.auth.getUser()");
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('run.status !== "completed"');
    expect(source).toContain("discoverTrendMarketplaceCandidates");
    expect(source).toContain("persistTrendMarketplaceApprovalCandidates");
    expect(source).toContain("persistTrendMercadoLivreApprovalCandidates");
    expect(source).toContain("counters");
    expect(source).toContain("automaticPublication: false");
  });

  it("considera ofertas existentes para não reapresentar produtos antigos", () => {
    const source = fs.readFileSync(routePath, "utf8");
    expect(source).toContain('from("offers")');
    expect(source).toContain("existingOffers");
    expect(source).toContain("exposed.add");
  });

  it("varia a página da busca para evitar repetir sempre o primeiro lote", () => {
    const source = fs.readFileSync(routePath, "utf8");
    expect(source).toContain("function rotationPage");
    expect(source).toContain("page: rotationPage(runId, query)");
    expect(source).toContain("limit: 20");
  });

  it("pagina as ofertas existentes além do limite padrão do Supabase", () => {
    const source = fs.readFileSync(routePath, "utf8");
    expect(source).toContain("loadExistingOfferIdentities");
    expect(source).toContain("SUPABASE_PAGE_SIZE = 1000");
    expect(source).toContain(".range(offset, offset + SUPABASE_PAGE_SIZE - 1)");
  });

  it("redireciona a aprovação para o canal recomendado após criar o draft", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/trends/approval-actions.ts"), "utf8");
    expect(source).toContain('import { redirect } from "next/navigation"');
    expect(source).toContain("redirect(`/${channel.toLocaleLowerCase");
  });

  it("conecta a aprovação do Radar ao motor central Official AI/Copy V3", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/trends/approval-actions.ts"), "utf8");
    expect(source).toContain("generateOfficialAI(");
    expect(source).toContain("createOfficialAIServiceDependencies(client, userId)");
    expect(source).toContain('metadata: { copyV2: true, copyV2Regenerate: true }');
    expect(source).toContain('origin: "trends.approval"');
    expect(source).not.toContain("createTrendAffiliateLinkAndDraft");
  });

  it("renderiza a fila Pronto para aprovar dentro da Trends", () => {
    const page = fs.readFileSync(pagePath, "utf8");
    const queue = fs.readFileSync(queuePath, "utf8");
    expect(page).toContain("listTrendApprovalQueueOffers(latestSnapshot?.id)");
    expect(page).toContain("<TrendApprovalQueue offers={approvalQueueOffers} />");
    expect(queue).toContain("Pronto para aprovar");
    expect(queue).toContain("approveTrendOfferAction");
    expect(queue).toContain("rejectTrendOfferAction");
    expect(queue).toContain("nenhuma publicação é automática");
  });
});
