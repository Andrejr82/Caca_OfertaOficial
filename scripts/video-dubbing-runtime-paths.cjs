const fs = require('fs');

const WINDOWS_EDGE_TTS_BIN = 'C:\\Users\\André\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\edge-tts.exe';
const ORACLE_EDGE_TTS_BIN = '/home/ubuntu/.local/bin/edge-tts';

function resolveEdgeTtsBin({
  env = process.env,
  platform = process.platform,
  existsSync = fs.existsSync,
} = {}) {
  if (env.EDGE_TTS_BIN) return env.EDGE_TTS_BIN;

  const runtimeCandidate = platform === 'win32'
    ? WINDOWS_EDGE_TTS_BIN
    : platform === 'linux'
      ? ORACLE_EDGE_TTS_BIN
      : null;

  return runtimeCandidate && existsSync(runtimeCandidate)
    ? runtimeCandidate
    : 'edge-tts';
}

module.exports = {
  resolveEdgeTtsBin,
};
