import { describe, expect, it } from "vitest";
import { getIntegrationStatuses } from "@/lib/security/integrations";
import { isPublicSafeEnvName, maskSecret } from "@/lib/security/mask";

describe("security helpers", () => {
  it("masks configured secrets", () => {
    expect(maskSecret("abcdef123456")).toBe("abc...456");
    expect(maskSecret("")).toBe("não configurado");
  });

  it("identifies public-safe env names", () => {
    expect(isPublicSafeEnvName("NEXT_PUBLIC_APP_NAME")).toBe(true);
    expect(isPublicSafeEnvName("TELEGRAM_BOT_TOKEN")).toBe(false);
  });

  it("reports integration statuses", () => {
    expect(getIntegrationStatuses().map((item) => item.name)).toContain("Telegram");
  });
});
