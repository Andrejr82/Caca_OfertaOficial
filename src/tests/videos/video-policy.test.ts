import { describe, expect, it } from "vitest";
import { getVideoJobPolicy, getVideoQuotaDecision } from "@/lib/videos/job-policy";

describe("video job policy", () => {
  it("removes the provider daily quota and keeps a safe queue limit", () => {
    expect(getVideoJobPolicy({ VIDEO_QUEUE_LIMIT: "0" })).toEqual({
      dailyLimit: null,
      queueLimit: 3
    });
  });

  it("does not block by daily count, but still protects the active queue", () => {
    expect(getVideoQuotaDecision({ todayCount: 100, activeCount: 0 }, { dailyLimit: null, queueLimit: 3 })).toEqual({
      allowed: true
    });
    expect(getVideoQuotaDecision({ todayCount: 1, activeCount: 3 }, { dailyLimit: null, queueLimit: 3 })).toEqual({
      allowed: false,
      reason: "queue_limit"
    });
  });
});
