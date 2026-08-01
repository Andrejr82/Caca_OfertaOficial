const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export type NormalizedDriveImage = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  extension: ".jpg" | ".png" | ".webp" | ".gif";
};

function detectImageType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { contentType: "image/jpeg" as const, extension: ".jpg" as const };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { contentType: "image/png" as const, extension: ".png" as const };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { contentType: "image/webp" as const, extension: ".webp" as const };
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return { contentType: "image/gif" as const, extension: ".gif" as const };
  return null;
}

/** Fetches a marketplace image and verifies its binary signature before Drive upload. */
export async function fetchAndNormalizeDriveImage(imageUrl: string): Promise<NormalizedDriveImage> {
  const response = await fetch(imageUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) throw new Error(`A origem da imagem respondeu HTTP ${response.status}.`);
  const source = Buffer.from(await response.arrayBuffer());
  if (!source.length) throw new Error("A origem da imagem retornou um arquivo vazio.");
  if (source.length > MAX_SOURCE_BYTES) throw new Error("A imagem excede o limite de 10 MB.");

  const type = detectImageType(source);
  if (!type) throw new Error("A resposta recebida não é uma imagem válida.");
  return { buffer: source, ...type };
}
