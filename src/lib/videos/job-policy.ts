export type VideoJobPolicy = { dailyLimit: null; queueLimit: number };
export type VideoQuotaDecision = { allowed: true } | { allowed: false; reason: "queue_limit" };

const DEFAULT_QUEUE_LIMIT = 3;

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function getVideoJobPolicy(env: Record<string, string | undefined> = process.env): VideoJobPolicy {
  return {
    dailyLimit: null,
    queueLimit: positiveInteger(env.VIDEO_QUEUE_LIMIT, DEFAULT_QUEUE_LIMIT, Number.MAX_SAFE_INTEGER)
  };
}

export function getVideoQuotaDecision(
  usage: { todayCount: number; activeCount: number },
  policy: VideoJobPolicy
): VideoQuotaDecision {
  if (usage.activeCount >= policy.queueLimit) return { allowed: false, reason: "queue_limit" };
  return { allowed: true };
}

export function quotaMessage(reason: Exclude<VideoQuotaDecision, { allowed: true }>["reason"], policy: VideoJobPolicy) {
  return reason === "queue_limit"
    ? `Há ${policy.queueLimit} vídeos aguardando processamento. Aguarde a fila diminuir.`
    : "Não foi possível adicionar o vídeo.";
}
