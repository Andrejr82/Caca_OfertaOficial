// @ts-expect-error sharp exports its runtime types in a path TypeScript does not resolve in this project setup.
import sharp from "sharp";

export const AUTO_REEL_FLUX_MODEL = "@cf/black-forest-labs/flux-2-klein-4b" as const;

const FLUX_INPUT_MAX_EDGE = 511;

export type AutoReelSceneKind = "presentation" | "start" | "use" | "result";

export type AutoReelScene = {
  number: number;
  kind: AutoReelSceneKind;
  seed: number;
  prompt: string;
  imageUrl: string;
};

export type AutoReelScenesSnapshot = {
  offerId: string;
  productName: string;
  currentPrice: number;
  platform: string;
  category?: string | null;
  imageUrl: string;
};

const fidelity = "Preserve the exact product from input image 0: preserve shape, color, proportions, visible design details and brand appearance. Do not replace the product, invent accessories. No text. No fake logos. No watermark. No duplicate product.";

const sceneActions: Array<{ kind: AutoReelSceneKind; seed: number; action: string }> = [
  { kind: "presentation", seed: 101, action: "Show the product clearly identified in a coherent natural environment of use." },
  { kind: "start", seed: 102, action: "Show a person or hands holding, positioning or preparing the product for its real use." },
  { kind: "use", seed: 103, action: "Show the product actively performing its main real function with a coherent contact or interaction." },
  { kind: "result", seed: 104, action: "Show the practical result while keeping the same product visible and recognizable." },
];

export function planAutoReelScenes(snapshot: AutoReelScenesSnapshot): AutoReelScene[] {
  if (!snapshot.offerId || !snapshot.productName?.trim() || !snapshot.imageUrl) {
    throw new Error("Oferta sem dados visuais obrigatórios.");
  }
  return sceneActions.map((definition, index) => ({
    number: index + 1,
    kind: definition.kind,
    seed: definition.seed,
    imageUrl: snapshot.imageUrl,
    prompt: `${definition.action} Product: ${snapshot.productName}. Category: ${snapshot.category ?? "physical product"}. ${fidelity} Photorealistic commercial vertical 9:16 composition, product protagonist, natural human action, no invented commercial claims.`,
  }));
}

export function canResumeAutoReelScenes(stage: string) {
  return stage === "planning" || stage === "generating_visual";
}

export function scenesToGenerate(
  planned: AutoReelScene[],
  existing: Array<Pick<AutoReelScene, "number">>,
) {
  const completed = new Set(existing.map((scene) => scene.number));
  return planned.filter((scene) => !completed.has(scene.number));
}

export function buildFluxMultipart(input: { image: Blob; prompt: string; seed: number }): FormData {
  const form = new FormData();
  form.append("input_image_0", input.image, "product.jpg");
  form.append("prompt", input.prompt);
  form.append("width", "768");
  form.append("height", "1024");
  form.append("seed", String(input.seed));
  return form;
}

export type GeneratedScene = {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
};

function decodeImage(value: unknown): Uint8Array {
  if (typeof value !== "string" || !value.trim()) throw new Error("Resposta visual vazia.");
  const encoded = value.replace(/^data:[^,]+,/, "");
  const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
  if (!bytes.length) throw new Error("Imagem visual inválida.");
  return bytes;
}

async function normalizeFluxInputImage(image: Blob): Promise<Blob> {
  const source = Buffer.from(await image.arrayBuffer());
  if (!source.length) throw new Error("Imagem factual vazia.");
  const normalized = await sharp(source)
    .rotate()
    .resize({ width: FLUX_INPUT_MAX_EDGE, height: FLUX_INPUT_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const metadata = await sharp(normalized).metadata();
  if (!metadata.width || !metadata.height || metadata.width > FLUX_INPUT_MAX_EDGE || metadata.height > FLUX_INPUT_MAX_EDGE) {
    throw new Error("Imagem factual incompatível com FLUX.");
  }
  return new Blob([new Uint8Array(normalized)], { type: "image/jpeg" });
}

function sanitizeCloudflareErrorBody(value: unknown) {
  if (!value || typeof value !== "object") return { code: null, message: "Falha no provider Cloudflare." };
  const body = value as { errors?: Array<{ code?: number | string; message?: string }>; error?: { code?: number | string; message?: string }; message?: string };
  const first = Array.isArray(body.errors) ? body.errors[0] : undefined;
  return {
    code: first?.code ?? body.error?.code ?? null,
    message: first?.message ?? body.error?.message ?? body.message ?? "Falha no provider Cloudflare.",
  };
}

async function cloudflareFailure(response: Response) {
  let parsed: unknown = null;
  try {
    const text = await response.text();
    if (text) parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const provider = sanitizeCloudflareErrorBody(parsed);
  return new Error(JSON.stringify({
    provider: "cloudflare",
    status: response.status,
    code: provider.code,
    message: provider.message,
    requestId: response.headers.get("cf-ray") ?? response.headers.get("x-request-id") ?? null,
  }));
}

export async function generateFluxScene(input: {
  image: Blob;
  prompt: string;
  seed: number;
  accountId: string;
  apiToken: string;
}): Promise<GeneratedScene> {
  if (!input.accountId || !input.apiToken) throw new Error("Cloudflare visual não configurado.");
  const fluxImage = await normalizeFluxInputImage(input.image);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${AUTO_REEL_FLUX_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiToken}`, Accept: "application/json,image/*" },
    body: buildFluxMultipart({ image: fluxImage, prompt: input.prompt, seed: input.seed }),
  });
  if (!response.ok) throw await cloudflareFailure(response);
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const bytes = contentType.includes("json")
    ? decodeImage((await response.json() as { result?: { image?: string } }).result?.image)
    : new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Imagem visual inválida.");
  const metadata = await sharp(Buffer.from(bytes)).metadata();
  if (!metadata.width || !metadata.height || metadata.width !== 768 || metadata.height !== 1024) {
    throw new Error(`Imagem visual inválida: ${metadata.width ?? 0}x${metadata.height ?? 0}.`);
  }
  return { bytes, contentType: contentType.includes("json") ? "image/jpeg" : contentType, width: metadata.width, height: metadata.height };
}

type PersistedScene = { storagePath: string; mediaUrl?: string };

export async function processAutoReelScenes(input: {
  jobId: string;
  factualSnapshot: AutoReelScenesSnapshot;
  sourceImage: Blob;
  existingScenes?: Array<AutoReelScene & PersistedScene>;
  generate: (scene: AutoReelScene, image: Blob) => Promise<GeneratedScene>;
  persistScene: (scene: AutoReelScene, generated: GeneratedScene) => Promise<PersistedScene>;
  updateJob: (jobId: string, stage: "planning" | "generating_visual" | "scenes_ready" | "failed", metadata?: Record<string, unknown>) => Promise<void> | void;
}) {
  const scenes = planAutoReelScenes(input.factualSnapshot);
  const existingScenes = input.existingScenes ?? [];
  const missingScenes = scenesToGenerate(scenes, existingScenes);
  const persisted: Array<AutoReelScene & PersistedScene> = [...existingScenes];
  try {
    await input.updateJob(input.jobId, "planning");
    await input.updateJob(input.jobId, "generating_visual");
    for (const scene of missingScenes) {
      const generated = await input.generate(scene, input.sourceImage);
      if (!generated.bytes?.length || generated.width !== 768 || generated.height !== 1024) throw new Error("Imagem visual inválida.");
      persisted.push({ ...scene, ...(await input.persistScene(scene, generated)) });
      await input.updateJob(input.jobId, "generating_visual", { visualScenes: persisted.map((item) => ({ ...item })) });
    }
    await input.updateJob(input.jobId, "scenes_ready", { scenes: persisted });
    return { status: "scenes_ready" as const, scenes: persisted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na geração visual.";
    try {
      await input.updateJob(input.jobId, "failed", { error: message.slice(0, 240) });
      return { status: "failed" as const, error: message };
    } catch (failureUpdateError) {
      const failureMessage = failureUpdateError instanceof Error ? failureUpdateError.message : "Falha ao persistir estado failed.";
      return { status: "failed" as const, error: message, failureUpdateError: failureMessage };
    }
  }
}
