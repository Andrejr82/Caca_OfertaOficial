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

test('Oracle Worker no longer uses an Amazon feature flag', () => {
  const source = fs.readFileSync(path.join(__dirname, 'oracle-scraper.cjs'), 'utf8');
  const runtime = source.slice(source.indexOf('async function scrapeStore(store)'), source.indexOf('async function persistDiscoveryIngestionV1'));
  assert.doesNotMatch(runtime, /AMAZON_NATIVE_TOP20_V5/);
});

test('Oracle Worker always routes Amazon to Native Top 20 V5', () => {
  const source = fs.readFileSync(path.join(__dirname, 'oracle-scraper.cjs'), 'utf8');
  const runtime = source.slice(source.indexOf('async function scrapeStore(store)'), source.indexOf('async function persistDiscoveryIngestionV1'));
  assert.match(runtime, /runAmazonNativeTop20/);
  assert.doesNotMatch(runtime, /fetchAmazonDiscoveryV3/);
});

test('/api/amazon/trends is fail-closed', () => {
  const source = fs.readFileSync(path.join(__dirname, 'oracle-api.cjs'), 'utf8');
  assert.match(source, /res\.status\(403\)\.json\(\{\s*error:\s*'Amazon Discovery API desativada\.'\s*\}\)/);
});

test('Amazon frontend scraping functions are stubbed out', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/affiliates/scraper.ts'), 'utf8');
  assert.match(source, /export async function fetchAmazonTrendingProducts[\s\S]*?return\s*\[\];/);
});
