'use strict';
const assert = require('node:assert/strict');
const { coverageGate } = require('../coverage-policy.cjs');
assert.equal(coverageGate(20).status, 'ok');
assert.equal(coverageGate(5, { sparse: true }).auto_selectable, true);
assert.equal(coverageGate(3).status, 'low_coverage');
assert.equal(coverageGate(0).status, 'unavailable');
console.log('PASS política de cobertura adaptativa');
