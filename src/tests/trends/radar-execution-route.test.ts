import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routePath = path.join(process.cwd(), "src/app/api/trends/execute/route.ts");
const buttonPath = path.join(process.cwd(), "src/components/trends/daily-radar-refresh-button.tsx");
const overviewPath = path.join(process.cwd(), "src/components/trends/executive-radar-overview.tsx");

describe("Radar execution route contract", () => {
  it("mantém autenticação, claim e resposta de solicitação para Oracle no endpoint", () => {
    const source = fs.readFileSync(routePath, "utf8");

    expect(source).toContain("client.auth.getUser()");
    expect(source).toContain("claimTrendRadarExecution");
    expect(source).toContain('runtime: "oracle"');
    expect(source).toContain("buildRadarExecutionWindow");
    expect(source).toContain("buildRadarRefreshExecutionWindow");
  });

  it("permite refresh explícito sem substituir a execução diária", () => {
    const routeSource = fs.readFileSync(routePath, "utf8");
    const buttonSource = fs.readFileSync(buttonPath, "utf8");

    expect(routeSource).toContain('searchParams.get("refresh") === "1"');
    expect(routeSource).toContain("buildRadarRefreshExecutionWindow()");
    expect(buttonSource).toContain('fetch("/api/trends/execute?refresh=1", { method: "POST" })');
    expect(buttonSource).toContain("Solicitar Radar");
  });

  it("renderiza foco e ranking a partir do último snapshot persistido", () => {
    const source = fs.readFileSync(overviewPath, "utf8");

    expect(source).toContain("const snapshotProducts = latestSnapshot?.products ?? []");
    expect(source).toContain("const focus = snapshotProducts.filter((item) => item.isFocus).slice(0, 3)");
    expect(source).toContain("snapshotProducts.map((item)");
    expect(source).not.toContain("const focus = ranking.filter((item) => item.isFocus).slice(0, 3)");
  });

  it("separa executar Radar de atualizar tela", () => {
    const source = fs.readFileSync(buttonPath, "utf8");

    expect(source).toContain("Solicitar Radar");
    expect(source).toContain("Atualizar tela");
  });
});
