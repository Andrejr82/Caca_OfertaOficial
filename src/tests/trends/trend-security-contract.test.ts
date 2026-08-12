import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..", "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("contratos de segurança e custo do Radar", () => {
  it("mantém o endpoint protegido e limitado", () => {
    const route = read("src/app/api/trends/approval-queue/execute/route.ts");
    expect(route).toContain("client.auth.getUser()");
    expect(route).toContain("eq(\"user_id\", user.id)");
    expect(route).toContain("export const maxDuration = 60");
    expect(route).toContain("MAX_REQUEST_BYTES");
    expect(route).toContain("maxConcurrentJobs: 2");
  });

  it("não expõe credenciais sensíveis como variáveis públicas", () => {
    const source = [
      read("src/lib/env.ts"),
      read("src/lib/supabase/server.ts"),
      read("src/lib/supabase/browser.ts"),
      read("src/app/api/trends/approval-queue/execute/route.ts"),
    ].join("\n");
    expect(source).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|SERVICE_ROLE_KEY)/);
  });

  it("desativa previews de branches não autorizadas na Vercel", () => {
    const config = JSON.parse(read("vercel.json")) as { git?: { deploymentEnabled?: Record<string, boolean> } };
    expect(config.git?.deploymentEnabled).toMatchObject({ "*": false, main: true, staging: true });
  });
});
