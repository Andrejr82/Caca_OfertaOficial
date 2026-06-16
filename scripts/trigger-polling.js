const { pollAndReplyComments } = require('../src/lib/instagram/comment-polling');
const fs = require('fs');

function loadEnv() {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  envFile.split('\n').forEach(line => {
    line = line.replace(/\r$/, '');
    if (line.startsWith('#') || !line.includes('=')) return;
    const eqIndex = line.indexOf('=');
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim().replace(/^"|"$/g, '');
    if (key) process.env[key] = val;
  });
}

async function run() {
  loadEnv();
  console.log("Executando polling manualmente...");
  try {
    const result = await pollAndReplyComments();
    console.log("Resultado do Polling:", result);
  } catch (e) {
    console.error("Erro fatal:", e);
  }
}

run();
