import { describe, expect, it } from "vitest";

import {
  buildCampaignTrackingKey,
  normalizeCampaignMarketplace,
  trackingTypeForMarketplace,
  validateOfficialMarketplaceUrl,
} from "@/lib/campaigns/offer-campaigns";

describe("campaign official links", () => {
  it("builds a deterministic alphanumeric tracking key per campaign and channel", () => {
    expect(buildCampaignTrackingKey("12345678-abcd-ef00-1111-222233334444", "instagram_reel"))
      .toBe("co12345678igr");
    expect(buildCampaignTrackingKey("12345678-abcd-ef00-1111-222233334444", "whatsapp"))
      .toBe("co12345678wa");
  });

  it("keeps tracking keys compatible with Mercado Livre Etiqueta constraints", () => {
    const key = buildCampaignTrackingKey("12345678-abcd-ef00-1111-222233334444", "facebook_group");
    expect(key).toMatch(/^[a-z0-9]+$/);
    expect(key.length).toBeLessThanOrEqual(30);
  });

  it("maps Shopee to Sub_id and Mercado Livre to Etiqueta", () => {
    expect(trackingTypeForMarketplace(normalizeCampaignMarketplace("Shopee"))).toBe("sub_id");
    expect(trackingTypeForMarketplace(normalizeCampaignMarketplace("Mercado Livre"))).toBe("etiqueta");
  });

  it("accepts official marketplace hosts", () => {
    expect(validateOfficialMarketplaceUrl("Shopee", "https://s.shopee.com.br/abc123")).toContain("s.shopee.com.br");
    expect(validateOfficialMarketplaceUrl("Mercado Livre", "https://www.mercadolivre.com.br/sec/abc")).toContain("mercadolivre.com.br");
  });

  it("rejects non-marketplace or insecure URLs", () => {
    expect(() => validateOfficialMarketplaceUrl("Shopee", "https://example.com/deal")).toThrow(/não pertence/i);
    expect(() => validateOfficialMarketplaceUrl("Mercado Livre", "http://mercadolivre.com.br/deal")).toThrow(/HTTPS/i);
  });
});
