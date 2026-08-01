import sharp from "sharp";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export type NormalizedDriveImage = {
  buffer: Buffer;
  contentType: "image/jpeg";
  extension: ".jpg";
  width: number;
  height: number;
};

/** Fetches a marketplace image and rewrites it as a real JPEG before Drive upload. */
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

  try {
    const normalized = await sharp(source).rotate().jpeg({ quality: 95, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    if (!normalized.data.length || !normalized.info.width || !normalized.info.height) {
      throw new Error("A imagem não possui dimensões válidas.");
    }
    return {
      buffer: normalized.data,
      contentType: "image/jpeg",
      extension: ".jpg",
      width: normalized.info.width,
      height: normalized.info.height,
    };
  } catch {
    throw new Error("A resposta recebida não é uma imagem válida.");
  }
}
