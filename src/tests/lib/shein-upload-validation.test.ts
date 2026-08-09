import { describe, expect, it } from "vitest";
import { detectSheinImageType } from "@/lib/publish/shein-upload-validation";

describe("SHEIN upload binary validation", () => {
  it("accepts real JPEG, PNG and WEBP signatures", () => {
    expect(detectSheinImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectSheinImageType(Buffer.from("89504e470d0a1a0a", "hex"))).toBe("image/png");
    expect(detectSheinImageType(Buffer.from("52494646" + "00000000" + "57454250", "hex"))).toBe("image/webp");
  });

  it("rejects a renamed WEBP and non-image bytes", () => {
    expect(detectSheinImageType(Buffer.from("not-an-image"))).toBeNull();
    expect(detectSheinImageType(Buffer.from("image/webp"))).toBeNull();
  });
});
