'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = path.join(__dirname, '__tests__');
const files = fs.readdirSync(testsDir)
  .filter((file) => file.endsWith('.test.cjs'))
  .map((file) => path.join(testsDir, file));

if (files.length === 0) {
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 0);
