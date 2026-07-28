import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequiredSupabaseAdminClient } from "@/lib/supabase/admin";

describe("createRequiredSupabaseAdminClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when the service role configuration is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(() => createRequiredSupabaseAdminClient()).toThrow(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required"
    );
  });
});
