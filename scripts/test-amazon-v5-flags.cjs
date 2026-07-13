const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Legacy Amazon pipeline functions are removed from oracle-scraper.cjs', () => {
  const source = fs.readFileSync(path.join(__dirname, 'oracle-scraper.cjs'), 'utf8');
  assert.doesNotMatch(source, /function fetchAmazonDiscoveryV3/);
  assert.doesNotMatch(source, /function applyAmazonNoveltyGate/);
  assert.doesNotMatch(source, /function canonicalizeAmazonProductUrl/);
});

test('AMAZON_NATIVE_TOP20_V5=false skips Amazon legacy correctly', () => {
  const source = fs.readFileSync(path.join(__dirname, 'oracle-scraper.cjs'), 'utf8');
  assert.match(source, /if\s*\(store\s*===\s*'Amazon'\)\s*\{\s*console\.log\('[^']*desativada[^']*'\);\s*return\s*\[\];\s*\}/);
});

test('AMAZON_NATIVE_TOP20_V5=true enables Amazon V5', () => {
  const source = fs.readFileSync(path.join(__dirname, 'oracle-scraper.cjs'), 'utf8');
  assert.match(source, /if\s*\(store\s*===\s*'Amazon'\s*&&\s*process\.env\.AMAZON_NATIVE_TOP20_V5\s*===\s*'true'\)/);
});

test('/api/amazon/trends is fail-closed', () => {
  const source = fs.readFileSync(path.join(__dirname, 'oracle-api.cjs'), 'utf8');
  assert.match(source, /res\.status\(403\)\.json\(\{\s*error:\s*'Amazon Discovery API desativada\.'\s*\}\)/);
});

test('Amazon frontend scraping functions are stubbed out', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/affiliates/scraper.ts'), 'utf8');
  assert.match(source, /export async function fetchAmazonTrendingProducts[\s\S]*?return\s*\[\];/);
});
