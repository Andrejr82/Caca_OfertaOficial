import { describe, expect, it } from "vitest";
import { publicationIdempotencyKey } from "@/lib/publication/official/create-official-publication-service";

describe("publicationIdempotencyKey", () => {
  it("creates a new explicit publication intent without changing the replay key", () => {
    expect(publicationIdempotencyKey("post-1", "whatsapp", "intent-1"))
      .toBe("publication:post-1:whatsapp:intent:intent-1");
    expect(publicationIdempotencyKey("post-1", "whatsapp", "intent-2"))
      .not.toBe(publicationIdempotencyKey("post-1", "whatsapp", "intent-1"));
  });

  it("keeps the legacy key available for callers that explicitly provide it", () => {
    expect(publicationIdempotencyKey("post-1", "telegram"))
      .toBe("publication:post-1:telegram");
  });
});
