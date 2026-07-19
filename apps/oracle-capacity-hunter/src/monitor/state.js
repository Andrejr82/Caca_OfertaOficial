const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = path.join(__dirname, '../../data/state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { alerts: {}, restarts: {} }; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, STATE_FILE);
}

module.exports = { loadState, saveState };
