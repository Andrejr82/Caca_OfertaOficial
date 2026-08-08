'use strict';

const ORACLE_RUNTIME_FLAGS = Object.freeze({
  SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true',
  SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'true',
  NO_POSTS: '1',
  NO_PUBLISH: '1',
});

const REQUIRED_KEYS = Object.freeze(Object.keys(ORACLE_RUNTIME_FLAGS));
const ALLOWED_VALUES = Object.freeze({
  SHOPEE_OPENAPI_ENGINE_V1_ENABLED: new Set(['true']),
  SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: new Set(['true']),
  NO_POSTS: new Set(['0', '1']),
  NO_PUBLISH: new Set(['1']),
});

function parseOverlay(source) {
  const parsed = {};
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)=([^\s#]*)$/.exec(line);
    if (!match) throw new Error('Oracle runtime overlay has invalid syntax.');
    const [, key, value] = match;
    if (!Object.hasOwn(ORACLE_RUNTIME_FLAGS, key)) {
      throw new Error(`Oracle runtime overlay key is not allowlisted: ${key}`);
    }
    if (Object.hasOwn(parsed, key)) throw new Error(`Oracle runtime overlay repeats key: ${key}`);
    if (!ALLOWED_VALUES[key].has(value)) {
      throw new Error(`Oracle runtime overlay value is invalid for ${key}.`);
    }
    parsed[key] = value;
  }

  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(parsed, key)) {
      throw new Error(`Oracle runtime overlay is missing required key: ${key}`);
    }
  }
  return Object.freeze({ ...parsed });
}

function mergeEnvText(currentEnv, overlay = ORACLE_RUNTIME_FLAGS) {
  const flags = parseOverlay(Object.entries(overlay).map(([key, value]) => `${key}=${value}`).join('\n'));
  const seen = new Set();
  const result = [];

  for (const line of String(currentEnv || '').replace(/\r\n/g, '\n').split('\n')) {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match || !Object.hasOwn(flags, match[1])) {
      result.push(line);
      continue;
    }
    const key = match[1];
    if (!seen.has(key)) result.push(`${key}=${flags[key]}`);
    seen.add(key);
  }
  for (const key of REQUIRED_KEYS) {
    if (!seen.has(key)) result.push(`${key}=${flags[key]}`);
  }
  return `${result.join('\n').replace(/\n+$/, '')}\n`;
}

function assertSafeRemotePath(value, label) {
  if (!/^\/[A-Za-z0-9._/-]+$/.test(value)) throw new Error(`${label} must be an absolute safe path.`);
}

function buildRemoteOverlayPlan({ projectDir, remoteStage, remoteBackup, overlay = ORACLE_RUNTIME_FLAGS }) {
  assertSafeRemotePath(projectDir, 'projectDir');
  assertSafeRemotePath(remoteStage, 'remoteStage');
  assertSafeRemotePath(remoteBackup, 'remoteBackup');
  const flags = parseOverlay(Object.entries(overlay).map(([key, value]) => `${key}=${value}`).join('\n'));
  const envFile = `${projectDir}/.env.local`;
  const overlayFile = `${remoteStage}/config/oracle-runtime-overlay.env`;
  const tempFile = `${envFile}.overlay-${remoteStage.split('-').at(-1)}`;
  const checks = REQUIRED_KEYS.map((key) => `grep -Fqx '${key}=${flags[key]}' '${overlayFile}'`).join(' && ');
  const allowlist = REQUIRED_KEYS.join('|');

  return [
    'set -eu',
    `test -s '${envFile}'`,
    `test -s '${overlayFile}'`,
    `test "$(grep -Ev '^[[:space:]]*(#|$)' '${overlayFile}' | wc -l | tr -d ' ')" -eq ${REQUIRED_KEYS.length}`,
    `if grep -Ev '^[[:space:]]*(#.*|(${allowlist})=(true|0|1)[[:space:]]*)$' '${overlayFile}' | grep -q .; then echo 'Overlay contains invalid or non-allowlisted key' >&2; exit 1; fi`,
    checks,
    `mkdir -p '${remoteBackup}'`,
    `cp -p '${envFile}' '${remoteBackup}/env.local.before'`,
    `chmod 700 '${remoteBackup}'`,
    `awk -F= 'NR == FNR { wanted[$1] = $2; order[++count] = $1; next } { key = $1; if (key in wanted) { if (!seen[key]++) print key "=" wanted[key]; next } print } END { for (i = 1; i <= count; i++) if (!seen[order[i]]) print order[i] "=" wanted[order[i]] }' '${overlayFile}' '${envFile}' > '${tempFile}'`,
    `test -s '${tempFile}'`,
    `chmod --reference='${envFile}' '${tempFile}' 2>/dev/null || true`,
    `mv '${tempFile}' '${envFile}'`,
    ...REQUIRED_KEYS.map((key) => `grep -Fqx '${key}=${flags[key]}' '${envFile}'`),
  ].join('; ');
}

function buildScraperRestartCommand(pm2ScraperName, overlay = ORACLE_RUNTIME_FLAGS) {
  if (!/^[A-Za-z0-9._/-]+$/.test(pm2ScraperName)) throw new Error('PM2 scraper name is invalid.');
  const flags = parseOverlay(Object.entries(overlay).map(([key, value]) => `${key}=${value}`).join('\n'));
  const exports = REQUIRED_KEYS.map((key) => `${key}=${flags[key]}`).join(' ');
  return `set -eu; export ${exports}; pm2 restart '${pm2ScraperName}' --update-env; pm2 describe '${pm2ScraperName}' >/dev/null`;
}

function buildOracleApiRestartCommand(pm2ApiName, overlay = ORACLE_RUNTIME_FLAGS) {
  if (!/^[A-Za-z0-9._/-]+$/.test(pm2ApiName)) throw new Error('PM2 API name is invalid.');
  const flags = parseOverlay(Object.entries(overlay).map(([key, value]) => `${key}=${value}`).join('\n'));
  const exports = REQUIRED_KEYS.map((key) => `${key}=${flags[key]}`).join(' ');
  return `set -eu; export ${exports}; pm2 restart '${pm2ApiName}' --update-env; pm2 describe '${pm2ApiName}' >/dev/null`;
}

module.exports = { ORACLE_RUNTIME_FLAGS, parseOverlay, mergeEnvText, buildRemoteOverlayPlan, buildScraperRestartCommand, buildOracleApiRestartCommand };
