import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicationTransportPort } from "@/core/publication";
import { OfficialPublicationTransportRegistry } from "@/lib/publication/official/create-official-publication-service";

describe("official publication server composition", () => {
  it("resolves exactly one delegated transport for every official channel", () => {
    const transports = ["telegram", "whatsapp", "instagram", "facebook"].map((channel) => ({
      channel,
      publish: async () => { throw new Error("not executed"); }
    })) as PublicationTransportPort[];
    const registry = new OfficialPublicationTransportRegistry(transports);
    for (const transport of transports) expect(registry.resolve(transport.channel)).toBe(transport);
  });

  it("fails closed for an unregistered transport", () => {
    const registry = new OfficialPublicationTransportRegistry([]);
    expect(() => registry.resolve("telegram")).toThrow(/not configured/i);
  });

  it("is the only production composition importing concrete official transports", () => {
    const composition = readFileSync(resolve(process.cwd(), "src/lib/publication/official/create-official-publication-service.ts"), "utf8");
    for (const channel of ["telegram", "whatsapp", "instagram", "facebook"]) {
      expect(composition).toContain(`@/core/publication/transports/${channel}-transport`);
    }
  });
});
