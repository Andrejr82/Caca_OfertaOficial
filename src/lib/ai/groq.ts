import type { Offer } from "@/types/domain";
import { PostBuilder } from "@/lib/post-builder";
import type { GeneratedCopyInput } from "@/lib/ai/schemas/generated-copy.schema";

const LEGACY_AI_DISABLED = "LEGACY_AI_DISABLED: use generateOfficialAI";

export interface AIAnalysisResult {
  score: number;
  telegram: string;
  instagram_feed: string;
  instagram_stories: string[];
  instagram_reels: string[];
  instagram_carousel: string[];
  whatsapp: string;
  winner_strategy_type?: string;
}

export interface AICurationResult {
  ai_score_boost: number;
  conversion_justification: string;
  strong_points: string[];
  weak_points: string[];
}

export async function callLLM(
  _systemPrompt: string,
  _userPrompt: string,
  _jsonSchema: unknown,
  _temperature = 0.7,
  _maxTokens = 1500
): Promise<string> {
  throw new Error(LEGACY_AI_DISABLED);
}

export async function generateOfferAnalysis(
  _offer: Offer,
  _links: { telegram: string; instagram: string; whatsapp: string }
): Promise<AIAnalysisResult> {
  throw new Error(LEGACY_AI_DISABLED);
}

export async function analyzeConversionPotential(
  _offer: Offer,
  _coldScore: number
): Promise<AICurationResult> {
  throw new Error(LEGACY_AI_DISABLED);
}

export function mapGeneratedCopyToLegacyResult(
  copyContext: GeneratedCopyInput,
  links: { telegram: string; instagram: string; whatsapp: string },
  offer: Offer
): AIAnalysisResult {
  const winner = copyContext.strategies.find((strategy) => strategy.type === copyContext.winner_type)
    ?? copyContext.strategies[0];
  if (!winner) throw new Error("Legacy copy mapping requires at least one strategy");
  const normalizedContext: GeneratedCopyInput = {
    ...copyContext,
    hashtags: copyContext.hashtags?.map((hashtag) => hashtag.startsWith("#") ? hashtag : `#${hashtag}`)
  };
  return {
    score: winner.score,
    winner_strategy_type: winner.type,
    telegram: PostBuilder.buildTelegramPost({ copy: winner, copyContext: normalizedContext, offer, affiliateLink: links.telegram }),
    instagram_feed: PostBuilder.buildInstagramPost({ copy: winner, copyContext: normalizedContext, offer, affiliateLink: links.instagram }),
    instagram_stories: ["Veja essa oferta incrível!", "Arraste para cima!"],
    instagram_reels: ["Oferta Imperdível!"],
    instagram_carousel: [],
    whatsapp: PostBuilder.buildWhatsappPost({ copy: winner, copyContext: normalizedContext, offer, affiliateLink: links.whatsapp })
  };
}
