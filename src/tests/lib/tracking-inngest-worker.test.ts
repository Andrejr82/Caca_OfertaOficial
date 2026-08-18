import { describe, expect, it } from "vitest";
import { resolveGoAffiliateDestination } from "@/lib/tracking/go-request";

describe("tracking redirect security regressions", () => {
  it("rejeita IPv4-mapped IPv6 privado após normalização WHATWG", () => {
    expect(resolveGoAffiliateDestination("http://[::ffff:127.0.0.1]/internal")).toBeNull();
    expect(resolveGoAffiliateDestination("http://[::ffff:10.0.0.1]/internal")).toBeNull();
  });

  it("preserva IPv4-mapped IPv6 público", () => {
    const publicMapped = "https://[::ffff:8.8.8.8]/offer";
    expect(resolveGoAffiliateDestination(publicMapped)).toBe(publicMapped);
  });

  it("não confunde domínios públicos iniciados por fc/fd com IPv6 privado", () => {
    expect(resolveGoAffiliateDestination("https://fcdomain.example/offer")).toBe("https://fcdomain.example/offer");
    expect(resolveGoAffiliateDestination("https://fddomain.example/offer")).toBe("https://fddomain.example/offer");
  });
});
