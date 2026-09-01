'use strict';

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
require('dotenv').config({ path: '.env.local' });

/**
 * Deploy direcionado do Oracle Worker.
 *
 * Ordem de operações (garante que o boot leia release real, não 'unknown'):
 *   backup remoto
 *   → upload dos scripts
 *   → gerar .runtime-release.json localmente
 *   → upload do JSON para o servidor
 *   → validar hashes remotos
 *   → restart PM2
 *   → validar boot
 */

const SERVER_IP = process.env.ORACLE_SERVER_IP || '193.122.242.178';
const SERVER_USER = process.env.ORACLE_SERVER_USER || 'ubuntu';
const PROJECT_DIR = process.env.ORACLE_PROJECT_DIR || '/home/ubuntu/Caca_OfertaOficial';
const PM2_SCRAPER_NAME = process.env.ORACLE_SCRAPER_PM2_NAME || 'oracle-scraper';
const PM2_API_NAME = process.env.ORACLE_API_PM2_NAME || 'oracle-api';
const SSH_PORT = process.env.ORACLE_SSH_PORT || '22';
const DEFAULT_KEY_PATH = path.resolve(__dirname, '..', 'keys', 'ssh-key-2026-06-25.key');
const SSH_KEY_PATH = process.env.ORACLE_SSH_KEY_PATH
  ? path.resolve(process.env.ORACLE_SSH_KEY_PATH)
  : (fs.existsSync(DEFAULT_KEY_PATH) ? DEFAULT_KEY_PATH : null);
const TARGET = `${SERVER_USER}@${SERVER_IP}`;
const FULL_DEPLOY_FILES = [
  // Radar de tendências v4: worker, runner e contrato temporal/seleção.
  'scripts/oracle-trends-radar-worker.cjs',
  'scripts/oracle-trends-radar-runner-seven-niches.cjs',
  'scripts/oracle-trends-radar-runner-seven-niches-v4.cjs',
  'scripts/oracle-trends-radar-v4-collectors.cjs',
  'scripts/oracle-trends-radar-engine.cjs',
  'scripts/oracle-trends-radar-seven-niches-runtime.cjs',
  'scripts/trend-radar-seven-niches-v4.cjs',
  'scripts/trend-radar-v4-config.cjs',
  'scripts/trend-radar-v4-domain.cjs',
  'scripts/trend-radar-v4-temporal.cjs',
  'scripts/trend-radar-v4-selection.cjs',
  'scripts/trend-radar-v4-persistence.cjs',
  'scripts/trend-radar-observation-history-v1.cjs',
  'scripts/commercial-niche-contracts.cjs',
  'scripts/commercial-niche-config.cjs',
  'src/core/trends/commercial-opportunity-score-v4.cjs',
  'scripts/shopee-feed-sync.cjs',
  'scripts/oracle-scraper.cjs',
  'scripts/oracle-scraper_remote.cjs',
  'scripts/oracle-trends-radar-runner.cjs',
  'scripts/editorial-scenario-config.cjs',
  'scripts/amazon-native-top20-v5.cjs',
  'scripts/amazon-scenario-config.cjs',
  'scripts/shopee-scenario-config.cjs',
  'scripts/shopee-native-discovery-v5.cjs',
  'scripts/shopee-openapi-shadow-engine-v1.cjs',
  'scripts/shopee-productcatids-map-v1.cjs',
  'scripts/shopee-ranking-v1-oracle-bridge.cjs',
  'scripts/shopee-openapi-v1-adapter.cjs',
  'scripts/contracts/shopee-openapi-v1/listItemFeeds.cjs',
  'scripts/contracts/shopee-openapi-v1/productOfferV2.cjs',
  'scripts/shopee-v1-flags.cjs',
  'scripts/shopee-openapi-v1-controlled-persist.cjs',
  'scripts/shopee-openapi-v1-discovery-shadow.cjs',
  'scripts/shopee-trends-miner.cjs',
  'scripts/mercadolivre-official-intents-v5.cjs',
  'scripts/mercadolivre-domain-category-map-v1.cjs',
  'scripts/mercadolivre-v1-flags.cjs',
  'scripts/publication-queue.cjs',
  'scripts/mercadolivre-canonical-classifier.cjs',
  'scripts/marketplace-classification-catalog.json',
  'scripts/oracle-worker-discovery-only.cjs',
  'scripts/classification-coverage.cjs',
  'scripts/oracle-resilience.cjs',
  'scripts/family-variant-selector.cjs',
  'scripts/family-key-engine.cjs',
  'scripts/curation-policy.cjs',
  'scripts/offer-freshness-gate.cjs',
  'scripts/marketplace-search-quality.cjs',
  'scripts/marketplace-scenario-contracts.cjs',
  'scripts/scenario-runtime-contract.cjs',
  'scripts/official-editorial-grid.cjs',
  'scripts/offer-quality-shadow-runtime.cjs',
  'scripts/offer-quality-queue-runtime.cjs',
  'scripts/first-discovery-flags.cjs',
  'scripts/first-discovery-quality.cjs',
  'scripts/first-discovery-candidate-quality.cjs',
  'scripts/telegram-auto-publisher.cjs',
  'scripts/facebook-auto-publisher.cjs',
  'src/lib/shopee/ranking/types.ts',
  'src/lib/shopee/ranking/normalization.ts',
  'src/lib/shopee/ranking/category-policies.ts',
  'src/lib/shopee/ranking/semantic-validator.ts',
  'src/lib/shopee/ranking/commercial-filters.ts',
  'src/lib/shopee/ranking/score.ts',
  'src/lib/shopee/ranking/oracle-adapter.ts',
  'src/core/trends/commercial-opportunity-score-v3.cjs',
];
const DEPLOY_PROFILES = Object.freeze({
  'shopee-curated-v2': Object.freeze([
    'scripts/oracle-scraper.cjs',
    'scripts/oracle-worker-discovery-only.cjs',
    'scripts/offer-freshness-gate.cjs',
    'scripts/shopee-curated-family-selection.cjs',
    'scripts/shopee-openapi-shadow-engine-v1.cjs',
    'scripts/shopee-productcatids-map-v1.cjs',
    'scripts/shopee-openapi-v1-adapter.cjs',
    'scripts/contracts/shopee-openapi-v1/listItemFeeds.cjs',
    'scripts/contracts/shopee-openapi-v1/productOfferV2.cjs',
  ]),
  full: Object.freeze(FULL_DEPLOY_FILES),
});
const DEPLOY_PROFILE = String(process.env.ORACLE_DEPLOY_PROFILE || 'shopee-curated-v2').trim();
const DEPLOY_FILES = DEPLOY_PROFILES[DEPLOY_PROFILE];
if (!DEPLOY_FILES) throw new Error(`ORACLE_DEPLOY_PROFILE inválido: ${DEPLOY_PROFILE}`);
const DEPLOY_DIRS = [...new Set(DEPLOY_FILES.map((relativeFile) => relativeFile.split('/').slice(0, -1).join('/')).filter(Boolean))];

if (!SERVER_IP || !SERVER_USER || !PROJECT_DIR || !SSH_KEY_PATH) throw new Error('ORACLE_SERVER_IP, ORACLE_SERVER_USER, ORACLE_PROJECT_DIR e ORACLE_SSH_KEY_PATH são obrigatórios.');
if (!/^[A-Za-z0-9._:-]+$/.test(SERVER_IP)) throw new Error('ORACLE_SERVER_IP inválido.');
if (!/^[A-Za-z0-9._-]+$/.test(SERVER_USER)) throw new Error('ORACLE_SERVER_USER inválido.');
if (!/^\d{1,5}$/.test(SSH_PORT) || Number(SSH_PORT) < 1 || Number(SSH_PORT) > 65535) throw new Error('ORACLE_SSH_PORT inválido.');
if (!fs.existsSync(SSH_KEY_PATH)) throw new Error('Chave SSH configurada não encontrada.');
if (!/^[A-Za-z0-9._/-]+$/.test(PM2_SCRAPER_NAME)) throw new Error('Nome PM2 inválido.');
if (!/^[A-Za-z0-9._/-]+$/.test(PM2_API_NAME)) throw new Error('Nome PM2 API inválido.');
if (!/^\/[A-Za-z0-9._/-]+$/.test(PROJECT_DIR)) throw new Error('ORACLE_PROJECT_DIR deve ser um caminho absoluto seguro.');

const ssh = (command) => execFileSync('ssh', [
  '-i', SSH_KEY_PATH,
  '-p', SSH_PORT,
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  TARGET,
  command,
], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

const scp = (localFile, remoteFile) => execFileSync('scp', [
  '-i', SSH_KEY_PATH,
  '-P', SSH_PORT,
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  localFile,
  `${TARGET}:${remoteFile}`,
], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

/**
 * Calcula SHA-256 de um arquivo local.
 * @param {string} filePath Caminho absoluto ao arquivo.
 * @returns {string} Hash hexadecimal de 64 caracteres.
 */
function computeSha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Obtém o commit HEAD atual do repositório local.
 * Usado para popular o campo "commit" do manifesto de release.
 * @returns {string} Hash do commit (40 chars) ou 'unknown' em caso de falha.
 */
function getLocalCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '..'),
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Constrói o manifesto de release que será gravado como .runtime-release.json
 * no servidor remoto. Os campos "commit" e "deployed_at" são lidos pelo
 * oracle-scraper.cjs na função runScrapingCycleCore (linha 880-881).
 *
 * @param {{ commit: string, files: Record<string, string> }} opts
 * @returns {{ commit: string, deployed_at: string, files: Record<string, string> }}
 */
function buildReleaseManifest({ commit, files }) {
  return {
    commit,
    deployed_at: new Date().toISOString(),
    files,
  };
}

const stamp = `${Date.now()}-${process.pid}`;
const remoteStage = `/tmp/caca-oferta-deploy-${stamp}`;
const remoteBackup = `${PROJECT_DIR}/.rollout-backups/oracle-runtime-${stamp}`;

try {
  console.log(`Conectando à Oracle ${TARGET} com perfil ${DEPLOY_PROFILE} (${DEPLOY_FILES.length} arquivos)...`);
  const deployDirs = DEPLOY_DIRS.map((relativeDir) => `'${remoteStage}/${relativeDir}' '${remoteBackup}/${relativeDir}' '${PROJECT_DIR}/${relativeDir}'`).join(' ');
  ssh(`set -eu; test -d '${PROJECT_DIR}'; mkdir -p '${remoteStage}/scripts' '${remoteStage}/config' '${remoteBackup}/scripts' ${deployDirs}`);

  // ─── Passo 1: backup remoto ───────────────────────────────────────────────
  const backupFiles = DEPLOY_FILES.map((relativeFile) => {
    const remotePath = `${PROJECT_DIR}/${relativeFile}`;
    const backupPath = `${remoteBackup}/${relativeFile}`;
    return `if test -f '${remotePath}'; then cp -p '${remotePath}' '${backupPath}'; fi`;
  }).join('; ');
  ssh(`set -eu; ${backupFiles}`);

  // ─── Passo 2: upload dos scripts ──────────────────────────────────────────
  for (const relativeFile of DEPLOY_FILES) {
    const localFile = path.resolve(__dirname, '..', relativeFile);
    if (!fs.existsSync(localFile)) throw new Error(`Arquivo local não encontrado: ${relativeFile}`);
    console.log(`Enviando ${relativeFile}...`);
    scp(localFile, `${remoteStage}/${relativeFile}`);
  }
  // ─── Passo 3: validar staged e instalar arquivos ──────────────────────────
  const installFiles = DEPLOY_FILES.map((relativeFile) => {
    const remotePath = `${PROJECT_DIR}/${relativeFile}`;
    const stagedPath = `${remoteStage}/${relativeFile}`;
    return `test -s '${stagedPath}' && install -m 0644 '${stagedPath}' '${remotePath}'`;
  }).join('; ');
  ssh(`set -eu; ${installFiles}`);

  // ─── Passo 4: gerar manifesto de release local ────────────────────────────
  const commit = getLocalCommit();
  const fileHashes = Object.fromEntries(
    DEPLOY_FILES.map((relativeFile) => [
      relativeFile,
      computeSha256(path.resolve(__dirname, '..', relativeFile)),
    ])
  );
  const manifest = buildReleaseManifest({ commit, files: fileHashes });
  const localManifestPath = path.join(os.tmpdir(), `runtime-release-${stamp}.json`);
  fs.writeFileSync(localManifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Manifesto de release gerado: commit=${commit}`);

  // ─── Passo 5: upload do JSON → servidor (ANTES do restart) ───────────────
  scp(localManifestPath, `${PROJECT_DIR}/.runtime-release.json`);
  console.log('Manifesto .runtime-release.json enviado ao servidor.');

  // ─── Passo 6: validar hash remoto em uma única conexão ────────────────────
  ssh(`set -eu; node -e 'const fs=require("fs"),crypto=require("crypto"),manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); for (const [file, expected] of Object.entries(manifest.files)) { const actual=crypto.createHash("sha256").update(fs.readFileSync("${PROJECT_DIR}/"+file)).digest("hex"); if (actual !== expected) throw new Error("Hash divergente: "+file); }' '${PROJECT_DIR}/.runtime-release.json'`);
  console.log(`Hashes validados: ${DEPLOY_FILES.length} arquivos.`);

  // ─── Passo 7: restart dos serviços preservando o .env.local produtivo ────
  ssh(`set -eu; pm2 restart '${PM2_SCRAPER_NAME}' --update-env; pm2 describe '${PM2_SCRAPER_NAME}' >/dev/null`);
  ssh(`set -eu; pm2 restart '${PM2_API_NAME}' --update-env; pm2 describe '${PM2_API_NAME}' >/dev/null`);

  // ─── Passo 8: limpeza do stage temporário ────────────────────────────────
  ssh(`rm -rf '${remoteStage}'`);
  fs.unlinkSync(localManifestPath);

  console.log(`Deploy do Oracle Worker concluído. release=${commit}`);
} catch (error) {
  try { ssh(`rm -rf '${remoteStage}'`); } catch { /* limpeza best-effort */ }
  console.error(`Falha no deploy Oracle: ${error.message}`);
  process.exitCode = 1;
}

module.exports = { buildReleaseManifest, computeSha256, getLocalCommit };
