import { describe, expect, it } from "vitest";
import { getVideoJobPolicy, getVideoQuotaDecision } from "@/lib/videos/job-policy";

describe("video job policy", () => {
  it("uses safe limits when environment values are invalid", () => {
    expect(getVideoJobPolicy({ VIDEO_DAILY_LIMIT: "invalid", VIDEO_QUEUE_LIMIT: "0" })).toEqual({
      dailyLimit: 3,
      queueLimit: 3
    });
  });

  it("blocks creation before a daily limit or queue limit is exceeded", () => {
    expect(getVideoQuotaDecision({ todayCount: 3, activeCount: 0 }, { dailyLimit: 3, queueLimit: 3 })).toEqual({
      allowed: false,
      reason: "daily_limit"
    });
    expect(getVideoQuotaDecision({ todayCount: 1, activeCount: 3 }, { dailyLimit: 3, queueLimit: 3 })).toEqual({
      allowed: false,
      reason: "queue_limit"
    });
  });
});
