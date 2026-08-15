export const AUTO_REEL_SOURCE = "auto-generated-reel" as const;
export const AUTO_REEL_STYLE = "demonstrative-reel" as const;

export const AUTO_REEL_PIPELINE_STATES = [
  "queued",
  "planning",
  "generating_visual",
  "scenes_ready",
  "analyzing",
  "dubbing",
  "rendering",
  "ready_for_review",
] as const;

export type AutoReelPipelineState = (typeof AUTO_REEL_PIPELINE_STATES)[number];
export type AutoReelStatus = AutoReelPipelineState | "approved" | "rejected" | "failed";

const autoReelLabels: Record<AutoReelStatus, string> = {
  queued: "Na fila",
  planning: "Planejando",
  generating_visual: "Gerando visual",
  scenes_ready: "Cenas prontas",
  analyzing: "Analisando",
  dubbing: "Dublando",
  rendering: "Renderizando",
  ready_for_review: "Pronto para revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  failed: "Falhou",
};

export function autoReelStatusLabel(status: AutoReelStatus) {
  return autoReelLabels[status];
}

export function isAutoReelTerminal(status: AutoReelStatus) {
  return ["ready_for_review", "approved", "rejected", "failed"].includes(status);
}

export type FactualOffer = {
  id: string;
  product_name: string;
  current_price: number;
  platform: string;
  image_url: string | null;
};

export function buildFactualSnapshotFromOffer(offer: FactualOffer) {
  if (!offer.id || !offer.product_name?.trim() || !Number.isFinite(offer.current_price) || !offer.image_url) {
    throw new Error("Oferta sem dados factuais obrigatórios.");
  }
  return {
    offerId: offer.id,
    productName: offer.product_name,
    currentPrice: offer.current_price,
    platform: offer.platform,
    imageUrl: offer.image_url,
  };
}

const pipelineStates = [
  "queued",
  "planning",
  "generating_visual",
  "scenes_ready",
  "analyzing",
  "dubbing",
  "rendering",
  "ready_for_review",
] as const;

type PipelineState = (typeof pipelineStates)[number];
type FinalState = "approved" | "rejected" | "failed";
type AutoReelState = PipelineState | FinalState;

type Offer = {
  id: string;
  ownerId: string;
  title: string;
  price: number;
  marketplace: string;
  imageUrl: string;
};

type OfferRepository = {
  findOwnedOffer: (offerId: string, userId: string) => Promise<Offer | null>;
};

type SnapshotInput = {
  offerId: string;
  userId: string;
  clientProduct?: unknown;
  offerRepository: OfferRepository;
};

export type VisualAnalysis = {
  visualScore: number;
  productCoherent: boolean;
  verticalSuitable: boolean;
  productVisible: boolean;
  durationSeconds: number;
  visualRisks: string[];
};

function requireOffer(offer: Offer | null, offerId: string, userId: string): Offer {
  if (!offer || offer.id !== offerId || offer.ownerId !== userId) {
    throw new Error("Oferta não encontrada para este usuário.");
  }
  if (!offer.title.trim() || !Number.isFinite(offer.price) || offer.price < 0 || !offer.imageUrl) {
    throw new Error("Oferta sem dados factuais obrigatórios.");
  }
  return offer;
}

export async function buildOfferSnapshot({ offerId, userId, offerRepository }: SnapshotInput) {
  const offer = requireOffer(await offerRepository.findOwnedOffer(offerId, userId), offerId, userId);
  return {
    offerId: offer.id,
    title: offer.title,
    price: offer.price,
    marketplace: offer.marketplace,
    imageUrl: offer.imageUrl,
  };
}

type CreateJobInput = SnapshotInput;

export async function createAutoReelJob(input: CreateJobInput) {
  const offer = requireOffer(
    await input.offerRepository.findOwnedOffer(input.offerId, input.userId),
    input.offerId,
    input.userId,
  );
  return {
    source: AUTO_REEL_SOURCE,
    type: AUTO_REEL_SOURCE,
    offerId: offer.id,
    productSnapshot: offer,
    style: AUTO_REEL_STYLE,
    status: "processing" as const,
    stage: "planning" as const,
    attempt: 1,
  };
}

const transitions: Record<AutoReelState, AutoReelState | null> = {
  queued: "planning",
  planning: "generating_visual",
  generating_visual: "scenes_ready",
  scenes_ready: "analyzing",
  analyzing: "dubbing",
  dubbing: "rendering",
  rendering: "ready_for_review",
  ready_for_review: null,
  approved: null,
  rejected: null,
  failed: null,
};

export function transitionAutoReelJob<T extends { status: AutoReelState }>(job: T, nextStatus: AutoReelState): T {
  if (transitions[job.status] !== nextStatus) {
    throw new Error(`Transição inválida: ${job.status} → ${nextStatus}`);
  }
  return { ...job, status: nextStatus };
}

export function validateVisualAnalysis(analysis: VisualAnalysis): VisualAnalysis {
  if (
    !Number.isFinite(analysis.visualScore) ||
    analysis.visualScore < 0 ||
    analysis.visualScore > 100 ||
    !Number.isFinite(analysis.durationSeconds) ||
    analysis.durationSeconds < 0 ||
    typeof analysis.productCoherent !== "boolean" ||
    typeof analysis.verticalSuitable !== "boolean" ||
    typeof analysis.productVisible !== "boolean" ||
    !Array.isArray(analysis.visualRisks)
  ) {
    throw new Error("Análise visual inválida.");
  }
  return analysis;
}

export function canAdvanceFromVisualAnalysis(analysis: VisualAnalysis, nextStatus: AutoReelState) {
  validateVisualAnalysis(analysis);
  return analysis.productCoherent && (!["dubbing", "ready_for_review"].includes(nextStatus) || analysis.productVisible);
}

export function buildDubbingV2Payload(job: { productSnapshot: unknown }, _visualConcept: unknown) {
  return { productSnapshot: job.productSnapshot };
}

export async function regenerateAutoReel<T extends { id: string; offerId: string; attempt: number; videoUrl?: string }>(previous: T) {
  return {
    ...previous,
    id: `${previous.id}-attempt-${previous.attempt + 1}`,
    attempt: previous.attempt + 1,
    videoUrl: null,
  };
}

export function approveAutoReel<T extends { status: AutoReelState }>(job: T) {
  if (job.status !== "ready_for_review") throw new Error("Somente vídeos prontos para revisão podem ser aprovados.");
  return { ...job, status: "approved" as const, published: false };
}

export function rejectAutoReel<T extends { status: AutoReelState }>(job: T) {
  if (job.status !== "ready_for_review") throw new Error("Somente vídeos prontos para revisão podem ser rejeitados.");
  return { ...job, status: "rejected" as const, published: false };
}

export function failAutoReel<T extends { status: AutoReelState }>(job: T) {
  if (!pipelineStates.includes(job.status as PipelineState)) throw new Error("Estado inválido para falha.");
  return { ...job, status: "failed" as const, published: false };
}
