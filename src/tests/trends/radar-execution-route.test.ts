import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routePath = path.join(process.cwd(), "src/app/api/trends/execute/route.ts");
const buttonPath = path.join(process.cwd(), "src/components/trends/daily-radar-refresh-button.tsx");

describe("Radar execution route contract", () => {
  it("mantém autenticação, claim, pipeline e snapshot no endpoint real", () => {
    const source = fs.readFileSync(routePath, "utf8");

    expect(source).toContain("client.auth.getUser()");
    expect(source).toContain("claimTrendRadarExecution");
    expect(source).toContain("fetchGoogleTrendSignals");
    expect(source).toContain("fetchMercadoLivreTrendSignals");
    expect(source).toContain("classifyTrendSignal");
    expect(source).toContain("matchTrendSignalsForUser");
    expect(source).toContain("buildExecutiveRadarRanking");
    expect(source).toContain("persistTrendRadarSnapshot");
    expect(source).toContain("status: 409");
    expect(source).toContain("markFailed");
  });

  it("separa executar Radar de atualizar tela", () => {
    const source = fs.readFileSync(buttonPath, "utf8");

    expect(source).toContain('fetch("/api/trends/execute", { method: "POST" })');
    expect(source).toContain("Executar Radar de Hoje");
    expect(source).toContain("Atualizar tela");
  });
});
