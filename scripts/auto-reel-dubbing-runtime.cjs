#!/usr/bin/env node
const fs = require('fs');
const { runFactualDubbingSimulation, measureWithEdgeTts } = require('./video-dubbing-factual-pipeline.cjs');
const { resolveEdgeTtsBin } = require('./video-dubbing-runtime-paths.cjs');

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const result = await runFactualDubbingSimulation({
    title: input.productName,
    price: input.currentPrice,
    marketplace: input.platform,
    durationSecs: 15,
  }, { measureTts: (copy) => measureWithEdgeTts(copy, { edgeTtsBin: resolveEdgeTtsBin() }) });
  process.stdout.write(JSON.stringify({ copy: result.copy, audioDuration: result.audioDuration, certified: result.certified, audioFits: result.audioFits }));
}

main().catch((error) => {
  process.stderr.write(String(error?.message || error).slice(0, 900));
  process.exitCode = 1;
});
