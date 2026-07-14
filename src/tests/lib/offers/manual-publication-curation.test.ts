import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertShopeePublishable,
  prepareOfferForPublication
} from "@/lib/offers/shopee-manual-curation";

type PublishOffer = { id: string; platform: string; status: string };
type PersistSelection = (offer: PublishOffer) => Promise<PublishOffer>;

describe("curadoria manual compartilhada antes da publicação", () => {
  it.each(["Shopee", "Mercado Livre", "Amazon"])(
    "persiste e confirma selected para %s antes de liberar a publicação",
    async (platform) => {
      const pending = { id: `offer-${platform}`, platform, status: "pending_manual_review" };
      const persist = vi.fn(async (offer: PublishOffer) => ({ ...offer, status: "selected" }));

      const selected = await prepareOfferForPublication(pending, persist);

      expect(persist).toHaveBeenCalledOnce();
      expect(selected.status).toBe("selected");
      expect(() => assertShopeePublishable(selected)).not.toThrow();
    }
  );

  it.each(["Shopee", "Mercado Livre", "Amazon"])(
    "mantém %s selected publicável sem gravar novamente",
    async (platform) => {
      const selected = { id: `offer-selected-${platform}`, platform, status: "selected" };
      const persist = vi.fn<PersistSelection>();

      await expect(prepareOfferForPublication(selected, persist)).resolves.toEqual(selected);
      expect(persist).not.toHaveBeenCalled();
    }
  );

  it("cancela a publicação quando selected não pode ser salvo", async () => {
    const pending = { id: "offer-save-error", platform: "Amazon", status: "pending_manual_review" };
    const persist = vi.fn<PersistSelection>().mockRejectedValue(new Error("falha ao salvar selected"));
    const publish = vi.fn();

    try {
      const selected = await prepareOfferForPublication(pending, persist);
      assertShopeePublishable(selected);
      publish();
    } catch {
      // A publicação deve permanecer cancelada.
    }

    expect(persist).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });

  it("cancela a publicação quando a persistência não confirma selected", async () => {
    const pending = { id: "offer-unconfirmed", platform: "Mercado Livre", status: "pending_manual_review" };
    const persist = vi.fn(async (offer: PublishOffer) => offer);

    await expect(prepareOfferForPublication(pending, persist)).rejects.toThrow(/confirmar selected/i);
  });

  it("mantém selected quando a publicação falha", async () => {
    let persisted = { id: "offer-publish-error", platform: "Shopee", status: "pending_manual_review" };
    const persist = vi.fn(async () => {
      persisted = { ...persisted, status: "selected" };
      return persisted;
    });
    const publish = vi.fn().mockRejectedValue(new Error("falha externa"));

    const selected = await prepareOfferForPublication(persisted, persist);
    await expect(publish(selected)).rejects.toThrow("falha externa");

    expect(persisted.status).toBe("selected");
    expect(persist).toHaveBeenCalledOnce();
  });

  it.each(["whatsapp", "telegram", "instagram"])(
    "exige approved + draft e usa o State Service na publicação em %s",
    (channel) => {
      const routeSource = readFileSync(
        resolve(process.cwd(), `src/app/api/${channel}/publish/route.ts`),
        "utf8"
      );

      expect(routeSource).not.toContain("prepareOfferForPublication");
      expect(routeSource).toContain('offer.status !== "approved"');
      expect(routeSource).toContain('post.status !== "draft"');
      expect(routeSource).toContain("completeOfficialPublication");
    }
  );
});
