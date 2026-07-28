'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const entry = path.resolve(__dirname, '../src/core/offer-quality/dry-run-cli.ts');
const result = spawnSync(process.execPath, ['-r', 'tsx/cjs', entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, OFFER_QUALITY_PIPELINE_V2: 'false' },
});

if (result.error) {
  console.error(`offer-quality dry-run failed: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
