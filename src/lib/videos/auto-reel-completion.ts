import { AUTO_REEL_SOURCE, AUTO_REEL_STYLE } from "./auto-reel";

const CTA = "Gostou? Corre pra conferir esse achado!";

type CompletionJob = {
  id: string;
  stage: string;
  status: string;
  attempt: number;
  metadata: { factualSnapshot?: Record<string, unknown>; visualScenes?: Array<Record<string, unknown>> };
  offerId?: string;
  videoUrl?: string | null;
};

type DubbingResult = { script: string; audioUrl: string; durationSeconds: number };
type RenderResult = { videoUrl: string; durationSeconds: number };

function facts(job: CompletionJob) {
  const snapshot = job.metadata?.factualSnapshot;
  const scenes = job.metadata?.visualScenes;
  if (!snapshot || !snapshot.productName || !snapshot.currentPrice || !snapshot.platform || !snapshot.imageUrl) throw new Error("Snapshot factual incompleto.");
  if (!Array.isArray(scenes) || scenes.length !== 4) throw new Error("Quatro cenas visuais são obrigatórias.");
  return { snapshot, scenes: [...scenes].sort((left, right) => Number(left.number) - Number(right.number)) };
}

export function buildAutoReelDubbingPayload(job: CompletionJob) {
  const { snapshot, scenes } = facts(job);
  return {
    source: AUTO_REEL_SOURCE,
    style: AUTO_REEL_STYLE,
    productName: snapshot.productName,
    price: snapshot.currentPrice,
    marketplace: snapshot.platform,
    visualScenes: scenes.map((scene) => ({ number: scene.number, kind: scene.kind, context: scene.prompt })),
    durationSeconds: 12,
  };
}

export function buildAutoReelRenderPayload(job: CompletionJob, audio: Pick<DubbingResult, "audioUrl" | "durationSeconds">) {
  const { snapshot, scenes } = facts(job);
  return {
    source: AUTO_REEL_SOURCE,
    aspectRatio: "9:16" as const,
    width: 1080,
    height: 1920,
    productName: snapshot.productName,
    price: snapshot.currentPrice,
    marketplace: snapshot.platform,
    cta: CTA,
    audioUrl: audio.audioUrl,
    audioDurationSeconds: audio.durationSeconds,
    scenes: scenes.map((scene) => ({ number: scene.number, kind: scene.kind, imageUrl: scene.mediaUrl ?? scene.imageUrl })),
  };
}

export async function processAutoReelCompletion(input: {
  job: CompletionJob;
  updateJob: (jobId: string, stage: string, metadata?: Record<string, unknown>) => Promise<void> | void;
  generateDubbing: (payload: ReturnType<typeof buildAutoReelDubbingPayload>) => Promise<DubbingResult>;
  render: (payload: ReturnType<typeof buildAutoReelRenderPayload>) => Promise<RenderResult>;
  persist: (result: { audioUrl: string; videoUrl: string; durationSeconds: number; status: "ready_for_review"; metadata: Record<string, unknown> }) => Promise<void>;
}) {
  if (input.job.stage !== "scenes_ready") return { status: "failed" as const, error: "Job não está pronto para conclusão." };
  try {
    await input.updateJob(input.job.id, "analyzing");
    await input.updateJob(input.job.id, "dubbing");
    const dubbing = await input.generateDubbing(buildAutoReelDubbingPayload(input.job));
    if (!dubbing.audioUrl || !Number.isFinite(dubbing.durationSeconds) || dubbing.durationSeconds <= 0) throw new Error("Áudio Dubbing inválido.");
    await input.updateJob(input.job.id, "rendering", { audioUrl: dubbing.audioUrl, audioDurationSeconds: dubbing.durationSeconds });
    const rendered = await input.render(buildAutoReelRenderPayload(input.job, dubbing));
    if (!rendered.videoUrl || !Number.isFinite(rendered.durationSeconds) || rendered.durationSeconds <= 0) throw new Error("MP4 renderizado inválido.");
    const metadata = { source: AUTO_REEL_SOURCE, attempt: input.job.attempt, audioUrl: dubbing.audioUrl, durationSeconds: rendered.durationSeconds };
    await input.persist({ audioUrl: dubbing.audioUrl, videoUrl: rendered.videoUrl, durationSeconds: rendered.durationSeconds, status: "ready_for_review", metadata });
    await input.updateJob(input.job.id, "ready_for_review", metadata);
    return { status: "ready_for_review" as const, videoUrl: rendered.videoUrl, audioUrl: dubbing.audioUrl, durationSeconds: rendered.durationSeconds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na conclusão do Reel.";
    await input.updateJob(input.job.id, "failed", { error: message.slice(0, 240) });
    return { status: "failed" as const, error: message };
  }
}

export function approveAutoReelCompletion<T extends { stage: string }>(job: T) {
  if (job.stage !== "ready_for_review") throw new Error("Somente vídeos prontos para revisão podem ser aprovados.");
  return { ...job, status: "approved" as const, published: false };
}

export function rejectAutoReelCompletion<T extends { stage: string }>(job: T) {
  if (job.stage !== "ready_for_review") throw new Error("Somente vídeos prontos para revisão podem ser rejeitados.");
  return { ...job, status: "rejected" as const, published: false };
}

export function regenerateAutoReelCompletion<T extends CompletionJob>(job: T) {
  if (!["ready_for_review", "approved", "rejected", "failed"].includes(job.stage)) throw new Error("Job não está pronto para regeneração.");
  const offerId = job.offerId ?? job.metadata?.factualSnapshot?.offerId;
  return { ...job, id: `${job.id}-attempt-${job.attempt + 1}`, offerId, attempt: job.attempt + 1, stage: "queued", status: "processing", videoUrl: null, metadata: { ...job.metadata, attempt: job.attempt + 1, previousAttemptId: job.id } };
}
