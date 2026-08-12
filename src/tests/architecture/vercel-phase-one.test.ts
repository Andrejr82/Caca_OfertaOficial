import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const config = JSON.parse(source("vercel.json")) as {
  ignoreCommand?: string;
  crons?: Array<{ path: string }>;
};

function ignoredBuildExitCode(ref?: string, force = false) {
  const env = { ...process.env };
  if (ref === undefined) delete env.VERCEL_GIT_COMMIT_REF;
  else env.VERCEL_GIT_COMMIT_REF = ref;
  if (force) env.VERCEL_FORCE_BUILD = "1";
  else delete env.VERCEL_FORCE_BUILD;
  return spawnSync(config.ignoreCommand!, { cwd: root, env, shell: true }).status;
}

describe("Vercel phase one boundaries", () => {
  it("builds main and deliberate CLI deploys while ignoring feature branches", () => {
    expect(config.ignoreCommand).toBeTypeOf("string");
    expect(ignoredBuildExitCode("main")).toBe(1);
    expect(ignoredBuildExitCode("feat/example")).toBe(0);
    expect(ignoredBuildExitCode()).toBe(1);
    expect(ignoredBuildExitCode("feat/example", true)).toBe(1);
  });

  it("does not schedule the disabled Instagram polling route", () => {
    expect(config.crons ?? []).not.toContainEqual(expect.objectContaining({ path: "/api/instagram/poll-comments" }));
  });

  it("disables automatic prefetch on every authenticated panel link", () => {
    const links = source("src/components/layout/app-shell.tsx").match(/<Link[\s\S]*?>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.includes("prefetch={false}"))).toBe(true);
  });

  it("removes the two unconsumed legacy routes and preserves critical handlers", () => {
    expect(existsSync(resolve(root, "src/app/api/scraper/cron/route.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/api/og/route.tsx"))).toBe(false);

    const preservedRoutes = [
      "src/app/api/inngest/route.ts",
      "src/app/api/ai/generate/route.ts",
      "src/app/api/instagram/poll-comments/route.ts",
      "src/app/api/instagram/publish/route.ts",
      "src/app/api/telegram/publish/route.ts",
      "src/app/api/whatsapp/publish/route.ts",
      "src/app/api/facebook/publish/route.ts",
      "src/app/api/auth/ml/login/route.ts",
      "src/app/go/[...subId]/route.ts",
    ];
    expect(preservedRoutes.every((path) => existsSync(resolve(root, path)))).toBe(true);
  });
});
