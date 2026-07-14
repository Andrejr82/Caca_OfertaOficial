import { afterEach, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET as readiness } from "@/app/api/readiness/route";

const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});

describe("health and readiness endpoints", () => {
  it("health responds without executing a business flow", async () => {
    const response = await health();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ service: "nextjs", healthy: true });
  });

  it("readiness reports dependency availability without exposing secrets", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-value";
    process.env.GROQ_API_KEY = "super-secret";
    const response = await readiness();
    const body = await response.json();
    expect([200, 503]).toContain(response.status);
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(body.checks.map((check: { name: string }) => check.name)).toEqual(expect.arrayContaining([
      "state-service", "official-ai", "official-publication", "supabase",
      "idempotency-storage", "audit-storage"
    ]));
  });
});
