import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CreativeCertificationPanel } from "@/app/(dashboard)/videos/CreativeCertificationPanel";
import { canApproveCreative, certifyCreativeCandidate } from "@/lib/videos/creative-candidate";

describe("CreativeCertificationPanel", () => {
  it("mantém o painel visível quando não há vídeo pronto", () => {
    render(<CreativeCertificationPanel jobs={[]} />);

    expect(screen.getByRole("heading", { name: "Certificação do criativo" })).toBeTruthy();
    expect(screen.getByText("Nenhum vídeo pronto para certificação no momento.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/disponível quando existir um vídeo com status ready/i);
  });

  it("mantém os controles de certificação para um job ready", () => {
    render(
      <CreativeCertificationPanel
        jobs={[{ id: "job-ready", status: "ready", offers: { product_name: "Vídeo demonstrativo" } }]}
      />,
    );

    expect((screen.getByLabelText("Vídeo") as HTMLSelectElement).value).toBe("job-ready");
    expect(screen.getByLabelText("Direito de uso")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Produto aparece claramente" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Certificar criativo" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Direito de uso"), { target: { value: "owned" } });
    expect((screen.getByRole("button", { name: "Certificar criativo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("mantém a política de aprovação fail-closed sem direito certificado", () => {
    const candidate = certifyCreativeCandidate({
      rightsStatus: "unverified",
      productVisible: true,
      demonstratesUse: true,
      strongHook: true,
      width: 1080,
      height: 1920,
      durationSeconds: 12,
    });

    expect(candidate.rightsCertified).toBe(false);
    expect(canApproveCreative(candidate)).toBe(false);
  });
});
