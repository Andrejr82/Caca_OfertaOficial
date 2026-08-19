import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routePath = path.join(process.cwd(), "src/app/api/trends/approval-queue/execute/route.ts");
const buttonPath = path.join(process.cwd(), "src/components/trends/daily-radar-refresh-button.tsx");
const pagePath = path.join(process.cwd(), "src/app/(dashboard)/trends/page.tsx");
const queuePath = path.join(process.cwd(), "src/components/trends/trend-approval-queue.tsx");

describe("Trend approval queue route contract", () => {
  it("mantém solicitação de Radar isolada e leve na interface", () => {
    const source = fs.readFileSync(buttonPath, "utf8");
    expect(source).toContain('fetch("/api/trends/execute?refresh=1"');
    expect(source).toContain("Solicitar Radar");
    expect(source).toContain("Atualizar tela");
  });

  it("exige Radar concluído do usuário antes da descoberta e persistência", () => {
    const source = fs.readFileSync(routePath, "utf8");
    expect(source).toContain("client.auth.getUser()");
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('run.status !== "completed"');
    expect(source).toContain("discoverTrendShopeeApprovalCandidates");
    expect(source).toContain("persistTrendShopeeApprovalCandidates");
    expect(source).toContain("automaticPublication: false");
  });

  it("renderiza a mesa de seleção comercial dentro da Trends", () => {
    const page = fs.readFileSync(pagePath, "utf8");
    const queue = fs.readFileSync(queuePath, "utf8");
    expect(page).toContain("listLatestTrendRadarSnapshot()");
    expect(page).toContain("<TrendsCommercialSelectionDesk snapshot={latestSnapshot} approvalFeedback={approvalFeedback} />");
    expect(queue).toContain("Pronto para aprovar");
    expect(queue).toContain("approveTrendShopeeOfferAction");
    expect(queue).toContain("rejectTrendShopeeOfferAction");
    expect(queue).toContain("nenhuma publicação é automática");
  });
});
