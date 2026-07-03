import { afterEach, describe, expect, it } from "vitest";
import {
  detectWhatsAppTargetKind,
  resolveConfiguredWhatsAppTargetId,
  sanitizeWhatsAppTargetId,
} from "@/lib/integrations/whatsapp/target";

afterEach(() => {
  delete process.env.WHATSAPP_TARGET_ID;
  delete process.env.WHATSAPP_CHANNEL_ID;
  delete process.env.WHATSAPP_DEFAULT_CHANNEL_ID;
});

describe("whatsapp target helpers", () => {
  it("sanitizes target ids", () => {
    expect(sanitizeWhatsAppTargetId(" '120363427692723224@g.us' ")).toBe("120363427692723224@g.us");
  });

  it("detects group and newsletter targets", () => {
    expect(detectWhatsAppTargetKind("120363427692723224@g.us")).toBe("group");
    expect(detectWhatsAppTargetKind("120363426476830692@newsletter")).toBe("newsletter");
    expect(detectWhatsAppTargetKind("invalid")).toBe("unknown");
  });

  it("prefers WHATSAPP_TARGET_ID over legacy fallbacks", () => {
    process.env.WHATSAPP_DEFAULT_CHANNEL_ID = "default@g.us";
    process.env.WHATSAPP_CHANNEL_ID = "legacy@newsletter";
    process.env.WHATSAPP_TARGET_ID = "preferred@g.us";

    expect(resolveConfiguredWhatsAppTargetId()).toBe("preferred@g.us");
  });

  it("falls back to legacy channel id when WHATSAPP_TARGET_ID is absent", () => {
    process.env.WHATSAPP_CHANNEL_ID = "120363426476830692@newsletter";

    expect(resolveConfiguredWhatsAppTargetId()).toBe("120363426476830692@newsletter");
    expect(detectWhatsAppTargetKind(resolveConfiguredWhatsAppTargetId())).toBe("newsletter");
  });
});
