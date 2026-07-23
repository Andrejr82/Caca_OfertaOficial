'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: '.env.local' });

/**
 * Deploy direcionado do Oracle Worker.
 *
 * O modo Git anterior não era seguro para alterações ainda não commitadas:
 * `git pull` simplesmente não levaria essas correções para a VPS. Este
 * script envia somente os arquivos explicitamente aprovados e reinicia apenas
 * o oracle-scraper, que é o processo afetado.
 */

const SERVER_IP = process.env.ORACLE_SERVER_IP || '193.122.242.178';
const SERVER_USER = process.env.ORACLE_SERVER_USER || 'ubuntu';
const PROJECT_DIR = process.env.ORACLE_PROJECT_DIR || '/home/ubuntu/Caca_OfertaOficial';
const PM2_SCRAPER_NAME = process.env.ORACLE_SCRAPER_PM2_NAME || 'oracle-scraper';
const SSH_KEY_PATH = path.resolve(__dirname, '../keys/ssh-key-2026-06-25.key');
const TARGET = `${SERVER_USER}@${SERVER_IP}`;
const DEPLOY_FILES = [
  'scripts/oracle-scraper.cjs',
  'scripts/oracle-worker-discovery-only.cjs',
  'scripts/curation-policy.cjs',
  'scripts/publication-queue.cjs',
  'scripts/shopee-scenario-config.cjs',
  'scripts/mercadolivre-official-intents-v5.cjs',
];

if (!fs.existsSync(SSH_KEY_PATH)) throw new Error(`Chave SSH não encontrada: ${SSH_KEY_PATH}`);
if (!/^[A-Za-z0-9._/-]+$/.test(PM2_SCRAPER_NAME)) throw new Error('Nome PM2 inválido.');
if (!/^\/[A-Za-z0-9._/-]+$/.test(PROJECT_DIR)) throw new Error('ORACLE_PROJECT_DIR deve ser um caminho absoluto seguro.');

const ssh = (command) => execFileSync('ssh', [
  '-i', SSH_KEY_PATH,
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15',
  TARGET,
  command,
], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

const scp = (localFile, remoteFile) => execFileSync('scp', [
  '-i', SSH_KEY_PATH,
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15',
  localFile,
  `${TARGET}:${remoteFile}`,
], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

const stamp = `${Date.now()}-${process.pid}`;
const remoteStage = `/tmp/caca-oferta-deploy-${stamp}`;
const remoteBackup = `/tmp/caca-oferta-backup-${stamp}`;

try {
  console.log(`Conectando à Oracle ${TARGET}...`);
  ssh(`set -eu; test -d '${PROJECT_DIR}'; mkdir -p '${remoteStage}/scripts' '${remoteBackup}/scripts'`);

  for (const relativeFile of DEPLOY_FILES) {
    const localFile = path.resolve(__dirname, '..', relativeFile);
    if (!fs.existsSync(localFile)) throw new Error(`Arquivo local não encontrado: ${relativeFile}`);
    console.log(`Enviando ${relativeFile}...`);
    scp(localFile, `${remoteStage}/${relativeFile}`);
  }

  console.log('Validando e instalando pacote atômico; reiniciando somente o oracle-scraper...');
  const remoteFiles = DEPLOY_FILES.map((relativeFile) => {
    const remotePath = `${PROJECT_DIR}/${relativeFile}`;
    const stagedPath = `${remoteStage}/${relativeFile}`;
    return `test -s '${stagedPath}' && install -m 0644 '${stagedPath}' '${remotePath}'`;
  }).join('; ');
  const backupFiles = DEPLOY_FILES.map((relativeFile) => {
    const remotePath = `${PROJECT_DIR}/${relativeFile}`;
    const backupPath = `${remoteBackup}/${relativeFile}`;
    return `if test -f '${remotePath}'; then cp -p '${remotePath}' '${backupPath}'; fi`;
  }).join('; ');
  ssh(`set -eu; ${backupFiles}; ${remoteFiles}; rm -rf '${remoteStage}'; pm2 restart '${PM2_SCRAPER_NAME}'; pm2 describe '${PM2_SCRAPER_NAME}' >/dev/null`);
  console.log('Deploy do Oracle Worker concluído.');
} catch (error) {
  try { ssh(`rm -rf '${remoteStage}'`); } catch { /* limpeza best-effort */ }
  console.error(`Falha no deploy Oracle: ${error.message}`);
  process.exitCode = 1;
}
