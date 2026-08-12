import { describe, expect, it } from "vitest";
import { readApiJson } from "@/lib/http/read-api-json";

describe("readApiJson", () => {
  it("reports the HTTP status when the server returns non-JSON text", async () => {
    await expect(readApiJson(new Response("An error occurred", { status: 504 })))
      .rejects.toThrow("Servidor demorou além do limite (504)");
  });
});
