import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Radar Mercado Livre credentials", () => {
  it("uses the operational token resolver before marketplace discovery", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/trends/approval-queue/execute/route.ts"),
      "utf8",
    );
    expect(source).toContain("getOperationalMLAccessToken");
  });

  it("does not bypass refresh credentials with a fixed access token", () => {
    const sources = [
      "src/app/api/trends/execute/route.ts",
      "src/app/api/trends/mercadolivre/route.ts",
      "src/app/api/trends/match/route.ts",
      "src/app/api/trends/approval-queue/execute/route.ts",
    ].map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8"));
    for (const source of sources) expect(source).not.toContain("MERCADO_LIVRE_ACCESS_TOKEN");
  });

  it("configures Supabase Admin for Node 20 WebSocket transport", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/supabase/admin.ts"), "utf8");
    expect(source).toContain('import WebSocket from "ws"');
    expect(source).toContain("realtime: { transport: WebSocket as never }");
  });
});
