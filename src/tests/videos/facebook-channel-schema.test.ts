import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Facebook channel schema contract", () => {
  it("has a non-destructive migration for affiliate links and posts", () => {
    const migration = readFileSync("supabase/migrations/20260731120000_add_facebook_channel_to_content.sql", "utf8");
    expect(migration).toContain("facebook");
    expect(migration).toContain("affiliate_links");
    expect(migration).toContain("posts");
    expect(migration).not.toMatch(/drop\s+table/i);
  });
});
