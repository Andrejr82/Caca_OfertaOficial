import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoReelClient } from "@/app/(dashboard)/reels/AutoReelClient";
import type { AutoReelStatus } from "@/lib/videos/auto-reel";

const offers = [{
  id: "11111111-1111-4111-8111-111111111111",
  product_name: "Shampoo A Seco Briá Beauty 150ml",
  current_price: 19.7,
  platform: "Shopee",
  image_url: "https://cdn.example.test/shampoo.jpg",
}];

describe("AutoReelClient controlled failures", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => cleanup());

  it("aplica o job failed retornado por /scenes mesmo quando a resposta é 502", async () => {
    const initialJob = { id: "job-failed-scenes", status: "processing" as AutoReelStatus, stage: "planning" as AutoReelStatus };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      job: { id: initialJob.id, status: "failed", stage: "failed" },
      error: '{"provider":"cloudflare","status":400,"code":3001,"message":"input image too large","requestId":"ray-test"}',
    }), { status: 502, headers: { "content-type": "application/json" } }));

    render(<AutoReelClient offers={offers} initialJobs={[initialJob]} />);

    await waitFor(() => expect(screen.getAllByText("Falhou").length).toBeGreaterThan(0));
    expect(screen.getByText(/input image too large/)).toBeTruthy();
  });

  it("exibe erro controlado quando /scenes devolve HTML em vez de JSON", async () => {
    const initialJob = { id: "job-html-scenes", status: "processing" as AutoReelStatus, stage: "planning" as AutoReelStatus };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<!DOCTYPE html><html><body>Internal Server Error</body></html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    }));

    render(<AutoReelClient offers={offers} initialJobs={[initialJob]} />);

    await waitFor(() => expect(screen.getByText("Falha HTTP 500: resposta inválida do servidor.")).toBeTruthy());
  });
});
