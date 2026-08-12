import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSource = readFileSync(resolve(process.cwd(), "src/app/api/inngest/route.ts"), "utf8");
const functionsSource = readFileSync(resolve(process.cwd(), "src/lib/inngest/functions.ts"), "utf8");

describe("Inngest disabled cron registration boundary", () => {
  it("does not register the disabled Instagram polling cron on the serve endpoint", () => {
    expect(routeSource).not.toContain("instagramPollingBackground");
  });

  it("does not register disabled analytics or scraping jobs", () => {
    expect(routeSource).not.toContain("syncAnalyticsBackground");
    expect(routeSource).not.toContain("runUserScrapingBackground");
  });

  it("removes disabled job definitions while preserving active handlers", () => {
    expect(functionsSource).not.toContain("PARALLEL_COMPONENT_DISABLED");
    expect(functionsSource).not.toContain("disabledJob");
    expect(routeSource).toContain("publishPostBackground");
    expect(routeSource).toContain("processOfferBackground");
    expect(routeSource).toContain("processClickBackground");
    expect(routeSource).toContain("sendTelegramCycleIntro");
    expect(routeSource).toContain("publishTelegramEditorialTop30");
  });
});
