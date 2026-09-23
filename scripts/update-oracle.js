'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: '.env.local' });

/**
 * Atualização e sincronização da VPS Oracle com o repositório.
 *
 * Etapas:
 * 1. Conecta via SSH à VPS Oracle.
 * 2. Atualiza a working tree da VPS via Git para o mesmo commit de origin/main.
 * 3. Gera e grava o manifesto de release `.runtime-release.json`.
 * 4. Reinicia os processos PM2 necessários (oracle-scraper, oracle-api, oracle-trends-radar).
 * 5. Valida o status do PM2 e comprova o commit ativo.
 */

const SERVER_IP = process.env.ORACLE_SERVER_IP || '193.122.242.178';
const SERVER_USER = process.env.ORACLE_SERVER_USER || 'ubuntu';
const PROJECT_DIR = process.env.ORACLE_PROJECT_DIR || '/home/ubuntu/Caca_OfertaOficial';
const SSH_PORT = process.env.ORACLE_SSH_PORT || '22';
const DEFAULT_KEY_PATH = path.resolve(__dirname, '..', 'keys', 'ssh-key-2026-06-25.key');
const SSH_KEY_PATH = process.env.ORACLE_SSH_KEY_PATH
  ? path.resolve(process.env.ORACLE_SSH_KEY_PATH)
  : (fs.existsSync(DEFAULT_KEY_PATH) ? DEFAULT_KEY_PATH : null);
const TARGET = `${SERVER_USER}@${SERVER_IP}`;

if (!SERVER_IP || !SERVER_USER || !PROJECT_DIR || !SSH_KEY_PATH) {
  throw new Error('Configurações da Oracle incompletas (IP, USER, DIR ou Chave SSH ausente).');
}
if (!fs.existsSync(SSH_KEY_PATH)) {
  throw new Error(`Chave SSH configurada não encontrada em: ${SSH_KEY_PATH}`);
}

function sshExec(command, options = {}) {
  return execFileSync('ssh', [
    '-i', SSH_KEY_PATH,
    '-p', SSH_PORT,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=15',
    TARGET,
    command,
  ], {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });
}

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

async function runUpdate() {
  const localCommit = getLocalCommit();
  console.log(`[Oracle Sync] Iniciando sincronização com a VPS ${TARGET}`);
  console.log(`[Oracle Sync] Commit HEAD Local: ${localCommit}`);

  // Passo 1: Verificar conectividade e diretório do projeto
  console.log('\n[Passo 1/5] Verificando diretório e estado na VPS...');
  sshExec(`test -d "${PROJECT_DIR}" || (echo "Diretório não encontrado" && exit 1)`);

  // Passo 2: Sincronizar repositório Git na VPS para a main
  console.log('\n[Passo 2/5] Atualizando repositório Git na VPS (git pull origin main)...');
  sshExec(`cd "${PROJECT_DIR}" && git fetch origin main && git reset --hard origin/main`);

  const remoteCommit = sshExec(`cd "${PROJECT_DIR}" && git rev-parse HEAD`, { capture: true }).trim();
  console.log(`[Oracle Sync] Commit HEAD Remoto: ${remoteCommit}`);

  if (remoteCommit !== localCommit) {
    console.warn(`[Aviso] Commit remoto (${remoteCommit}) difere do local (${localCommit}). Certifique-se de que o push para origin/main foi concluído.`);
  }

  // Passo 3: Gravar manifesto .runtime-release.json
  console.log('\n[Passo 3/5] Gravando manifesto .runtime-release.json...');
  const manifest = {
    commit: remoteCommit,
    deployed_at: new Date().toISOString(),
    deployed_by: 'update-oracle-script',
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  sshExec(`cat << 'EOF' > "${PROJECT_DIR}/.runtime-release.json"\n${manifestJson}\nEOF`);

  // Passo 4: Reiniciar processos PM2
  console.log('\n[Passo 4/5] Reiniciando processos PM2 na VPS...');
  sshExec(`pm2 restart oracle-scraper oracle-api oracle-trends-radar --update-env || pm2 restart all`);

  // Passo 5: Validar status dos serviços
  console.log('\n[Passo 5/5] Validando status dos serviços PM2...');
  sshExec(`pm2 status`);

  console.log(`\n✅ Sincronização da VPS Oracle concluída com sucesso! (Commit: ${remoteCommit})`);
}

if (require.main === module) {
  runUpdate().catch((error) => {
    console.error(`\n❌ Falha na sincronização com a VPS Oracle: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { runUpdate, getLocalCommit };
