import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSource = readFileSync(resolve(process.cwd(), "src/app/api/inngest/route.ts"), "utf8");

describe("Inngest disabled cron registration boundary", () => {
  it("does not register the disabled Instagram polling cron on the serve endpoint", () => {
    expect(routeSource).not.toContain("instagramPollingBackground");
  });
});
