export const AUTO_REEL_FLUX_MODEL = "@cf/black-forest-labs/flux-2-klein-4b" as const;

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
  return !["scenes_ready", "failed"].includes(stage);
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

export async function generateFluxScene(input: {
  image: Blob;
  prompt: string;
  seed: number;
  accountId: string;
  apiToken: string;
}): Promise<GeneratedScene> {
  if (!input.accountId || !input.apiToken) throw new Error("Cloudflare visual não configurado.");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${AUTO_REEL_FLUX_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiToken}`, Accept: "application/json,image/*" },
    body: buildFluxMultipart(input),
  });
  if (!response.ok) throw new Error(`Cloudflare HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const bytes = contentType.includes("json")
    ? decodeImage((await response.json() as { result?: { image?: string } }).result?.image)
    : new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Imagem visual inválida.");
  return { bytes, contentType: contentType.includes("json") ? "image/jpeg" : contentType, width: 768, height: 1024 };
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
  await input.updateJob(input.jobId, "planning");
  const persisted: Array<AutoReelScene & PersistedScene> = [...existingScenes];
  try {
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
    await input.updateJob(input.jobId, "failed", { error: message.slice(0, 240) });
    return { status: "failed" as const, error: message };
  }
}
