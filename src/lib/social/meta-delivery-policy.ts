import type { CopyV4Facts } from "@/core/ai/copy-v4";
import { buildInstagramConversionV4Plan } from "@/lib/social/instagram-conversion";

export const INSTAGRAM_STORY_DELIVERY_MODE = "manual_link_sticker" as const;

export interface InstagramStoryHandoffV4 {
  mode: typeof INSTAGRAM_STORY_DELIVERY_MODE;
  publishAutomatically: false;
  requiresManualLinkSticker: true;
  trackedUrl: string;
  commercialAngle: ReturnType<typeof buildInstagramConversionV4Plan>["commercialAngle"];
  frames: ReturnType<typeof buildInstagramConversionV4Plan>["storyFrames"];
  instructions: readonly [
    "Publicar as 3 telas na ordem gerada.",
    "Na terceira tela, adicionar manualmente o sticker de link.",
    "Usar exatamente o trackedUrl como destino do sticker."
  ];
}

/**
 * Reels V4 permanece desligado por padrão até existir geração audiovisual
 * aprovada de ponta a ponta. A flag precisa ser opt-in explícito.
 */
export function isInstagramReelsV4Enabled(env: Pick<NodeJS.ProcessEnv, "INSTAGRAM_REELS_V4_ENABLED"> = process.env) {
  return env.INSTAGRAM_REELS_V4_ENABLED?.trim().toLocaleLowerCase("en-US") === "true";
}

export function buildInstagramStoryHandoffV4(
  facts: CopyV4Facts,
  trackedUrl: string,
): InstagramStoryHandoffV4 {
  const plan = buildInstagramConversionV4Plan(facts, trackedUrl);
  const finalFrame = plan.storyFrames.find((frame) => frame.purpose === "action");
  if (!finalFrame?.trackedUrl) {
    throw new Error("Instagram Story V4 handoff requires a tracked URL on the action frame");
  }

  return {
    mode: INSTAGRAM_STORY_DELIVERY_MODE,
    publishAutomatically: false,
    requiresManualLinkSticker: true,
    trackedUrl: finalFrame.trackedUrl,
    commercialAngle: plan.commercialAngle,
    frames: plan.storyFrames,
    instructions: [
      "Publicar as 3 telas na ordem gerada.",
      "Na terceira tela, adicionar manualmente o sticker de link.",
      "Usar exatamente o trackedUrl como destino do sticker.",
    ],
  };
}
