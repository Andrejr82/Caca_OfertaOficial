'use strict';

// Carregar .env.local
require('dotenv').config({ path: '.env.local' });

// Mockar funções e variáveis para testes controlados
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Ler o script original
const scriptContent = fs.readFileSync(path.join(__dirname, 'scripts', 'oracle-scraper.cjs'), 'utf8');

// Modificar o script para não executar o ciclo automaticamente e exportar tudo
const modifiedContent = scriptContent
  // Comentar a execução automática e o cron
  .replace(/runScrapingCycle\(\)\.catch.*?;/, '// runScrapingCycle().catch(e => console.error(\'❌ Erro no ciclo:\', e.message));')
  .replace(/cron\.schedule\(CRON_SCHEDULE,.*?\);/s, '// cron.schedule(CRON_SCHEDULE, () => runScrapingCycle().catch(e => console.error(\'❌ Erro:\', e.message)), { name: \'oracle-scraper-v2\', timezone: \'America/Sao_Paulo\', noOverlap: true });')
  // Exportar tudo
  .replace(/module\.exports\s*=\s*\{[^}]*\};/, 'module.exports = { crawleeExtract, cleanProductUrl, normalizeImageUrl, buildAffiliateUrl, calculateScoreV1, calculateScoreV2, generateFallback, getRandomQueries, scrapeStore, upsertOffer, processTopOffers, runScrapingCycle, GOLDEN_QUERIES };');

// Criar um módulo temporário
const tempModulePath = path.join(__dirname, 'temp-oracle-controlled.cjs');
fs.writeFileSync(tempModulePath, modifiedContent);

// Importar o módulo
const oracle = require(tempModulePath);

console.log('✅ Script carregado, funções disponíveis:', Object.keys(oracle));
console.log('');

// Testar: Vamos criar uma versão simplificada de scrapeStore para uma loja e 1 query
console.log('🧪 Testando scrapeStore para Mercado Livre com 1 query...');

// Vamos sobrescrever getRandomQueries apenas para este teste
const originalGetRandomQueries = oracle.getRandomQueries;
oracle.getRandomQueries = (store) => {
  // Para teste, retornar apenas 1 query
  return ['Café'];
};

// Testar scrapeStore para Mercado Livre
oracle.scrapeStore('Mercado Livre')
  .then((candidates) => {
    console.log('✅ scrapeStore concluído!');
    console.log('📦 Ofertas encontradas:', candidates.length);
    candidates.forEach((c, i) => {
      console.log(`  [${i+1}] ${c.product.product_name} - R$${c.product.current_price}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro no scrapeStore:', err);
  })
  .finally(() => {
    // Restaurar getRandomQueries original
    oracle.getRandomQueries = originalGetRandomQueries;
    // Limpar arquivo temporário
    if (fs.existsSync(tempModulePath)) {
      fs.unlinkSync(tempModulePath);
    }
  });
