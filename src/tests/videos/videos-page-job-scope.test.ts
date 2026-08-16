import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("escopo de jobs da pagina Videos de ofertas", () => {
  it("inclui Gemini/Drive e videos da extensao sem reintroduzir Auto Reel", () => {
    const page = read("src/app/(dashboard)/videos/page.tsx");
    const approve = read("src/app/api/videos/jobs/[id]/approve/route.ts");

    for (const source of [page, approve]) {
      expect(source).toContain('"gemini-drive-v1"');
      expect(source).toContain('"motion-v1"');
      expect(source).not.toContain('"auto-reel-v1"');
    }
  });
});
