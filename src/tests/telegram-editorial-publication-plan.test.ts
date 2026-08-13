import { describe, expect, it } from "vitest";
import {
  buildTelegramEditorialPublicationPlan,
  selectEnabledTelegramAutomationUserIds,
} from "@/lib/inngest/telegram-editorial-publication";

describe("Telegram editorial publication plan", () => {
  it("does not let one tenant's setting enable another tenant", () => {
    const enabledUserIds = selectEnabledTelegramAutomationUserIds([
      { user_id: "user-a", value: { telegram_automation_enabled: true } },
      { user_id: "user-b", value: { telegram_automation_enabled: false } },
      { user_id: "user-c", value: null },
    ]);

    expect(enabledUserIds).toEqual(["user-a"]);
  });

  it("does not dispatch the historical backlog when automation is activated", () => {
    const historical = Array.from({ length: 500 }, (_, index) => ({
      id: `old-post-${index}`,
      offer_id: `old-offer-${index}`,
      status: "draft" as const,
      created_at: "2026-08-01T10:00:00.000Z"
    }));
    const current = Array.from({ length: 30 }, (_, index) => ({
      id: `current-post-${index}`,
      offer_id: `current-offer-${index}`,
      status: "draft" as const,
      created_at: "2026-08-13T10:00:00.000Z"
    }));

    const plan = buildTelegramEditorialPublicationPlan(
      [...historical, ...current],
      current.map((post) => post.offer_id),
    );

    expect(plan).toHaveLength(30);
    expect(plan.every((post) => post.id.startsWith("current-"))).toBe(true);
  });
});
