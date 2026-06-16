export const featureFlags = {
  get ENABLE_CURATION_ENGINE() {
    return process.env.ENABLE_CURATION_ENGINE === "true";
  },
  get ENABLE_AI_CURATION() {
    return process.env.ENABLE_AI_CURATION === "true";
  },
  get ENABLE_HISTORICAL_SCORING() {
    return process.env.ENABLE_HISTORICAL_SCORING === "true";
  },
  get ENABLE_SHADOW_SCORING() {
    return process.env.ENABLE_SHADOW_SCORING === "true";
  },
  get ENABLE_CONVERSION_ENGINE() {
    return process.env.ENABLE_CONVERSION_ENGINE === "true";
  }
};
