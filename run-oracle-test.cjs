'use strict';

// Carregar .env.local
require('dotenv').config({ path: '.env.local' });

// Re-exportar e modificar temporariamente o script para teste
const fs = require('fs');
const path = require('path');

// Ler o script original
const originalScript = fs.readFileSync(path.join(__dirname, 'scripts', 'oracle-scraper.cjs'), 'utf8');

// Modificar:
// 1. Exportar todas as funções
// 2. Adicionar uma função de teste que executa um ciclo pequeno
const modifiedScript = originalScript
  // Garantir que todas as funções são exportadas
  .replace(
    /module\.exports\s*=\s*\{([^}]+)\};/,
    `module.exports = { 
  crawleeExtract,
  cleanProductUrl,
  normalizeImageUrl,
  buildAffiliateUrl,
  calculateScoreV1,
  calculateScoreV2,
  generateFallback,
  getRandomQueries,
  scrapeStore,
  upsertOffer,
  processTopOffers,
  runScrapingCycle
};`
  )
  // Modificar o OFFERS_PER_STORE para 1
  .replace(/const OFFERS_PER_STORE = \d+;/, 'const OFFERS_PER_STORE = 1;')
  // Modificar GOLDEN_QUERIES para retornar apenas 1 query por loja
  .replace(/const GOLDEN_QUERIES = \{/, 'const GOLDEN_QUERIES = {');

// Salvar o script modificado temporariamente
const tempScriptPath = path.join(__dirname, 'temp-oracle-test.cjs');
fs.writeFileSync(tempScriptPath, modifiedScript);

// Importar o script modificado
const oracleTest = require(tempScriptPath);

console.log('🚀 Iniciando ciclo de teste (modificado para velocidade)...');
console.log('');

// Executar o ciclo!
oracleTest.runScrapingCycle().catch(err => {
  console.error('❌ Erro no ciclo de teste:', err);
}).finally(() => {
  // Limpar o arquivo temporário
  if (fs.existsSync(tempScriptPath)) {
    fs.unlinkSync(tempScriptPath);
  }
});
