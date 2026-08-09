export type SheinImageMime = "image/jpeg" | "image/png" | "image/webp";

export function detectSheinImageType(buffer: Buffer): SheinImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function hasExactImageBytes(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && expected.equals(actual);
}
