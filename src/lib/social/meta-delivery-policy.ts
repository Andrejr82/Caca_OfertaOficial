/**
 * Reels permanece desligado por padrão até existir geração audiovisual
 * aprovada de ponta a ponta. A flag precisa ser opt-in explícito.
 *
 * O antigo handoff de Stories estáticos foi aposentado. Stories, quando voltarem
 * ao fluxo comercial, reutilizarão o próprio vídeo do Reel.
 */
export function isInstagramReelsV4Enabled(
  env?: { INSTAGRAM_REELS_V4_ENABLED?: string },
) {
  const value =
    env?.INSTAGRAM_REELS_V4_ENABLED ??
    process.env.INSTAGRAM_REELS_V4_ENABLED;

  return value?.trim().toLocaleLowerCase("en-US") === "true";
}
