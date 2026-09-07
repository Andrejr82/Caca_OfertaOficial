'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Sprint 9 — Ausência de Caminhos Legados de Seleção e Ranking Paralelo', () => {
  const root = path.resolve(__dirname, '../..');
  const oracleWorkerPath = path.join(root, 'scripts/oracle-worker-discovery-only.cjs');
  const oracleContent = fs.readFileSync(oracleWorkerPath, 'utf8');

  // 1. Verifica ausência de flags de ranking fantasma/shadow no Oracle Worker
  assert.equal(
    /RANKING_SHADOW_MODE\s*=\s*true/i.test(oracleContent),
    false,
    'Não deve existir RANKING_SHADOW_MODE ativo no worker.'
  );

  // 2. Verifica que RankingEngine não é importado em nenhum arquivo de runtime sob src/app ou scripts produtivos
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
