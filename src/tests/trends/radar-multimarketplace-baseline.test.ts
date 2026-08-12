import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const queueRoutePath = path.join(process.cwd(), "src/app/api/trends/approval-queue/execute/route.ts");
const queueQueryPath = path.join(process.cwd(), "src/lib/trends/approval-queue-queries.ts");
const buttonPath = path.join(process.cwd(), "src/components/trends/daily-radar-refresh-button.tsx");

describe("Radar multimarketplace baseline gaps", () => {
  it("executa descoberta comercial da Shopee e do Mercado Livre na etapa de fila", () => {
    const source = fs.readFileSync(queueRoutePath, "utf8");

    expect(source).toContain("discoverTrendMarketplaceCandidates");
    expect(source).toContain("searchShopeeOfficialV1");
    expect(source).toContain("searchMercadoLivreForTrendQueries");
  });

  it("não limita a fila do Radar ao marketplace Shopee", () => {
    const source = fs.readFileSync(queueQueryPath, "utf8");

    expect(source).not.toContain('.eq("platform", "Shopee")');
  });

  it("a etapa de fila materializa candidatos dos dois marketplaces", () => {
    const source = fs.readFileSync(queueRoutePath, "utf8");

    expect(source).toContain("discoverTrendMarketplaceCandidates");
    expect(source).toContain("persistTrendMercadoLivreApprovalCandidates");
    expect(source).toContain("persistTrendMarketplaceApprovalCandidates");
  });

  it("o clique do Radar exibe o resultado separado por marketplace", () => {
    const source = fs.readFileSync(buttonPath, "utf8");

    expect(source).toContain("/api/trends/execute?refresh=1");
    expect(source).toContain("/api/trends/approval-queue/execute");
    expect(source).toContain("Shopee");
    expect(source).toContain("Mercado Livre");
    expect(source).toContain("resultado parcial");
  });
});
