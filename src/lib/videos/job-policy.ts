export type VideoJobPolicy = { dailyLimit: number; queueLimit: number };
export type VideoQuotaDecision = { allowed: true } | { allowed: false; reason: "daily_limit" | "queue_limit" };

const MAX_DAILY_LIMIT = 3;

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function getVideoJobPolicy(env: Record<string, string | undefined> = process.env): VideoJobPolicy {
  return {
    dailyLimit: positiveInteger(env.VIDEO_DAILY_LIMIT, MAX_DAILY_LIMIT, MAX_DAILY_LIMIT),
    queueLimit: positiveInteger(env.VIDEO_QUEUE_LIMIT, MAX_DAILY_LIMIT, MAX_DAILY_LIMIT)
  };
}

export function getVideoQuotaDecision(
  usage: { todayCount: number; activeCount: number },
  policy: VideoJobPolicy
): VideoQuotaDecision {
  if (usage.todayCount >= policy.dailyLimit) return { allowed: false, reason: "daily_limit" };
  if (usage.activeCount >= policy.queueLimit) return { allowed: false, reason: "queue_limit" };
  return { allowed: true };
}

export function quotaMessage(reason: Exclude<VideoQuotaDecision, { allowed: true }>["reason"], policy: VideoJobPolicy) {
  return reason === "daily_limit"
    ? `Limite de ${policy.dailyLimit} vídeos a cada 24 horas atingido.`
    : `Há ${policy.queueLimit} vídeos aguardando processamento. Aguarde a fila diminuir.`;
}
