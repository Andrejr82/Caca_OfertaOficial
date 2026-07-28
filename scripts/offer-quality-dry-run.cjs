'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const entry = path.resolve(__dirname, '../src/core/offer-quality/dry-run-cli.ts');
const result = spawnSync(command, ['--no-install', 'tsx', entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, OFFER_QUALITY_PIPELINE_V2: 'false' },
});

if (result.error) {
  console.error(`offer-quality dry-run failed: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
