import { describe, expect, it } from "vitest";
import { validateTransition } from "@/core/state/state-machine";

describe("Trends rejected offer reopen transition", () => {
  it("permite rejected -> pending_manual_review para novo teste auditado", () => {
    expect(validateTransition("offer", "rejected", "pending_manual_review")).toBe(true);
  });

  it("não libera atalhos de rejected diretamente para selected/approved/posted", () => {
    expect(validateTransition("offer", "rejected", "selected")).toBe(false);
    expect(validateTransition("offer", "rejected", "approved")).toBe(false);
    expect(validateTransition("offer", "rejected", "posted")).toBe(false);
  });
});
