'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Sprint 9 — Ausência de Caminhos Legados de Seleção e Ranking Paralelo', () => {
  const root = path.resolve(__dirname, '../..');
  const oracleWorkerPath = path.join(root, 'scripts/oracle-worker-discovery-only.cjs');
  const oracleContent = fs.readFileSync(oracleWorkerPath, 'utf8');

  // 1. Verifica ausência de flags de ranking fantasma/shadow e de curation-policy no Oracle Worker
  assert.equal(
    /require\(['"].*curation-policy\.cjs['"]\)/i.test(oracleContent),
    false,
    'Não deve existir importação de curation-policy.cjs no Oracle Worker.'
  );

  assert.equal(
    /process\.env\.OFFER_QUALITY_PIPELINE_V2/i.test(oracleContent),
    false,
    'Não deve existir checagem de flag OFFER_QUALITY_PIPELINE_V2 no Oracle Worker.'
  );

  assert.equal(
    /qualityAdmission\(/i.test(oracleContent),
    false,
    'Não deve existir chamada de qualityAdmission no Oracle Worker.'
  );

  // 2. Verifica que select-cycle-commercial-portfolio.ts não importa commercial-portfolio-selector legado
  const portfolioCycleFile = path.join(root, 'src/lib/ai/official/select-cycle-commercial-portfolio.ts');
  const portfolioCycleContent = fs.readFileSync(portfolioCycleFile, 'utf8');
  assert.equal(
    /from\s+['"]@\/core\/curation\/commercial-portfolio-selector['"]/i.test(portfolioCycleContent),
    false,
    'select-cycle-commercial-portfolio.ts não deve importar o commercial-portfolio-selector legado.'
  );
  assert.equal(
    /selectCommercialPortfolioV2/i.test(portfolioCycleContent),
    true,
    'select-cycle-commercial-portfolio.ts deve utilizar selectCommercialPortfolioV2.'
  );

  // 3. Verifica que RankingEngine não é importado em nenhum arquivo de runtime sob src/app ou scripts produtivos
  const appDir = path.join(root, 'src/app');
  function scanDir(dir, pattern) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const matches = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
        matches.push(...scanDir(full, pattern));
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.cjs'))) {
        const content = fs.readFileSync(full, 'utf8');
        if (pattern.test(content)) {
          matches.push(full);
        }
      }
    }
    return matches;
  }

  const legacyRankingImports = scanDir(appDir, /from\s+['"].*ranking-engine['"]/i);
  assert.equal(
    legacyRankingImports.length,
    0,
    `Nenhum arquivo em src/app pode importar ranking-engine. Encontrados: ${legacyRankingImports.join(', ')}`
  );
});

test('Sprint 9 — O fluxo Oracle não mantém fila, score ou flags legadas', () => {
  const root = path.resolve(__dirname, '../..');
  const worker = fs.readFileSync(path.join(root, 'scripts/oracle-worker-discovery-only.cjs'), 'utf8');
  const scraper = fs.readFileSync(path.join(root, 'scripts/oracle-scraper.cjs'), 'utf8');
  const remoteScraper = fs.readFileSync(path.join(root, 'scripts/oracle-scraper_remote.cjs'), 'utf8');
  const familySelector = fs.readFileSync(path.join(root, 'scripts/family-variant-selector.cjs'), 'utf8');
  const publicationQueue = fs.readFileSync(path.join(root, 'scripts/publication-queue.cjs'), 'utf8');

  assert.equal(/selectCopyQueue|createCandidateV1|createIngestionV1/.test(worker), false);
  assert.equal(/qualityShadow|qualityAdmission|OFFER_QUALITY_PIPELINE_V2/.test(worker), false);
  assert.equal(/qualityShadow|qualityAdmission|OFFER_QUALITY_PIPELINE_V2/.test(scraper), false);
  assert.equal(/qualityShadow|qualityAdmission|OFFER_QUALITY_PIPELINE_V2/.test(remoteScraper), false);
  assert.equal(/curation-policy\.cjs|scoreCandidate|qualityGate/.test(familySelector), false);
  assert.equal(/curation-policy\.cjs/.test(publicationQueue), false);
});
