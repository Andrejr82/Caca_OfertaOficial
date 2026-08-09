import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const functionsSource = readFileSync(resolve(process.cwd(), "src/lib/inngest/functions.ts"), "utf8");
const routeSource = readFileSync(resolve(process.cwd(), "src/app/api/inngest/route.ts"), "utf8");

describe("Inngest Telegram registration boundary", () => {
  it("does not load the environment-sensitive Telegram publisher while registering functions", () => {
    expect(functionsSource).not.toMatch(/^const\s*\{\s*createTelegramPublisher\s*\}\s*=\s*require\(/m);
    expect(functionsSource).toMatch(/function\s+loadTelegramPublisher\s*\(/);
  });

  it("keeps the Telegram function registered on the Inngest serve endpoint", () => {
    expect(routeSource).toContain("publishTelegramEditorialTop30");
  });
});
