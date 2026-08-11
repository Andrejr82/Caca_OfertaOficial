import { describe, expect, it } from "vitest";
import { loadEditorialTop30TelegramSelection } from "@/lib/telegram/select-editorial-top30-telegram-drafts";

function createQueryClient() {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  let queryCount = 0;

  const client = {
    from(table: string) {
      const currentQuery = queryCount++;
      const query: any = {
        select(...args: unknown[]) { calls.push({ table, method: "select", args }); return query; },
        eq(...args: unknown[]) { calls.push({ table, method: "eq", args }); return query; },
        gte(...args: unknown[]) { calls.push({ table, method: "gte", args }); return query; },
        order(...args: unknown[]) { calls.push({ table, method: "order", args }); return query; },
        range(...args: unknown[]) { calls.push({ table, method: "range", args }); return query; },
        in(...args: unknown[]) { calls.push({ table, method: "in", args }); return query; },
        then(resolve: (value: unknown) => unknown) {
          const data = currentQuery === 0 ? [] : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  };

  return { client, calls };
}

describe("Telegram editorial query cost boundary", () => {
  it("limits the expensive offers join to the 24h editorial window", async () => {
    const { client, calls } = createQueryClient();
    const now = new Date("2026-08-11T12:00:00.000Z");

    await loadEditorialTop30TelegramSelection(client, now);

    expect(calls).toContainEqual({ table: "posts", method: "eq", args: ["channel", "telegram"] });
    expect(calls).toContainEqual({ table: "posts", method: "eq", args: ["status", "draft"] });
    expect(calls).toContainEqual({ table: "posts", method: "gte", args: ["created_at", "2026-08-10T12:00:00.000Z"] });
  });
});
