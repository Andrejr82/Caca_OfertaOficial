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
});
