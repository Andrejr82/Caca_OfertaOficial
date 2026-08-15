export const CREATIVE_RIGHTS_STATUSES = [
  "owned",
  "seller_authorized",
  "creator_authorized",
  "official_reusable",
] as const;

export type CreativeRightsStatus = (typeof CREATIVE_RIGHTS_STATUSES)[number] | "unverified";

export type CreativeCandidateInput = {
  rightsStatus: CreativeRightsStatus;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  productVisible: boolean;
  demonstratesUse: boolean;
  strongHook: boolean;
};

export type CreativeCandidateCertification = CreativeCandidateInput & {
  rightsCertified: boolean;
  score: number;
  grade: "excellent" | "good" | "fair" | "weak";
  checks: {
    vertical: boolean;
    socialResolution: boolean;
    socialDuration: boolean;
  };
};

function isFinitePositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isRightsCertified(status: CreativeRightsStatus) {
  return CREATIVE_RIGHTS_STATUSES.includes(status as (typeof CREATIVE_RIGHTS_STATUSES)[number]);
}

function gradeScore(score: number): CreativeCandidateCertification["grade"] {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "fair";
  return "weak";
}

export function certifyCreativeCandidate(input: CreativeCandidateInput): CreativeCandidateCertification {
  const vertical = isFinitePositive(input.width) && isFinitePositive(input.height) && input.height > input.width;
  const socialResolution = isFinitePositive(input.width) && isFinitePositive(input.height)
    && Math.min(input.width, input.height) >= 480
    && Math.max(input.width, input.height) >= 854;
  const socialDuration = isFinitePositive(input.durationSeconds)
    && input.durationSeconds >= 5
    && input.durationSeconds <= 15;

  const score = [
    input.productVisible ? 30 : 0,
    input.demonstratesUse ? 25 : 0,
    input.strongHook ? 15 : 0,
    vertical ? 10 : 0,
    socialResolution ? 10 : 0,
    socialDuration ? 10 : 0,
  ].reduce((total, points) => total + points, 0);

  return {
    ...input,
    rightsCertified: isRightsCertified(input.rightsStatus),
    score,
    grade: gradeScore(score),
    checks: { vertical, socialResolution, socialDuration },
  };
}

export function canApproveCreative(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return false;
  const candidate = (metadata as { creativeCandidate?: unknown }).creativeCandidate;
  if (!candidate || typeof candidate !== "object") return false;
  return (candidate as { rightsCertified?: unknown }).rightsCertified === true;
}
