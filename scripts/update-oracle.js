const { execSync } = require('child_process');
require('dotenv').config({ path: '.env.local' });

/**
 * Script para atualizar a VPS da Oracle.
 * Pode ser executado via: node scripts/update-oracle.js
 * 
 * Certifique-se de ter configurado o acesso SSH sem senha (ou digite quando solicitado).
 */

// Configurações do servidor Oracle
const SERVER_IP = process.env.ORACLE_SERVER_IP || '193.122.242.178'; // IP encontrado nos testes
const SERVER_USER = process.env.ORACLE_SERVER_USER || 'ubuntu';      // Usuário padrão comum
const PROJECT_DIR = process.env.ORACLE_PROJECT_DIR || '~/Caca_OfertaOficial';
const PM2_APP_NAME = process.env.ORACLE_PM2_NAME || 'oracle-api'; // ou o nome do processo que você utiliza (ex: index)
const PM2_SCRAPER_NAME = process.env.ORACLE_SCRAPER_PM2_NAME || 'oracle-scraper';
const SSH_KEY_PATH = 'C:\\Projetos_GitHub\\Caca_OfertaOficial\\ssh-key-2026-06-25.key'; // Chave de acesso

console.log(`🚀 Iniciando rotina de atualização da Oracle API (${SERVER_IP})...`);

// Existem duas abordagens principais para atualizar a VPS. 
// A abordagem 1 usa Git (recomendada se o servidor tem o repositório clonado).
// A abordagem 2 usa SCP (recomendada se você apenas faz upload do script solto).

// --- ABORDAGEM 1: VIA GIT PULL (Padrão) ---
const sshCommandGit = `ssh -i ${SSH_KEY_PATH} ${SERVER_USER}@${SERVER_IP} "cd ${PROJECT_DIR} && git pull origin main && npm install && pm2 restart ${PM2_APP_NAME} && pm2 restart ${PM2_SCRAPER_NAME}"`;

// --- ABORDAGEM 2: VIA SCP (Upload direto do arquivo) ---
// Descomente a linha abaixo se preferir enviar o arquivo diretamente ao invés de usar git pull
// const sshCommandScp = `scp -i ${SSH_KEY_PATH} scripts/oracle-api.cjs ${SERVER_USER}@${SERVER_IP}:${PROJECT_DIR}/scripts/oracle-api.cjs && ssh -i ${SSH_KEY_PATH} ${SERVER_USER}@${SERVER_IP} "pm2 restart ${PM2_APP_NAME} && pm2 restart ${PM2_SCRAPER_NAME}"`;

try {
  console.log(`📡 Conectando ao servidor Oracle e executando atualização...`);
  console.log(`> ${sshCommandGit}`); // Se for usar SCP, mude para sshCommandScp
  
  // Executa o comando e exibe o output no terminal (permite inserir senha se necessário)
  execSync(sshCommandGit, { stdio: 'inherit' }); // Mude para sshCommandScp caso use a abordagem 2
  
  console.log('✅ Atualização concluída com sucesso no servidor Oracle!');
  console.log('🌐 A API Oracle já deve estar rodando com a versão mais recente.');
} catch (error) {
  console.error('\n❌ Erro durante a atualização na Oracle:');
  console.error(error.message);
  console.log('\nDica: Verifique se sua chave SSH está configurada, se o IP/Usuário estão corretos, e se o diretório do projeto e PM2 existem no servidor.');
  process.exit(1);
}
