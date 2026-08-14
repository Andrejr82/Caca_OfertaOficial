#!/usr/bin/env node

const { runFactualDubbingSimulation } = require('./video-dubbing-factual-pipeline.cjs');

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const title = readArg('title');
  const price = readArg('price');
  const marketplace = readArg('marketplace');
  const durationSecs = readArg('duration');

  if (!title || !price || !marketplace || !durationSecs) {
    throw new Error('Uso: node scripts/simulate-video-dubbing-v2.cjs --title "..." --price "29.90" --marketplace "Shopee" --duration "12"');
  }

  const result = await runFactualDubbingSimulation({
    title,
    price,
    marketplace,
    durationSecs,
  });

  console.log(JSON.stringify({
    entrada: result.input,
    extracao_certificada: result.extraction,
    selecao: result.selection,
    copy: result.copy,
    certificada: result.certified,
    ajustada: result.adjusted,
    duracao_video: result.videoDuration,
    duracao_audio: result.audioDuration,
    tentativas_tts: result.attempts,
    audio_cabe: result.audioFits,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
