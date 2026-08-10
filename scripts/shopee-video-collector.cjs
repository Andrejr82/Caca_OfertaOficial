const axios = require('axios');
const fs = require('fs');
const { findVideoCandidateFromHtml } = require('../extensions/shopee-video-extractor/video-parser.js');

function normalizeId(value, name) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/u.test(normalized)) throw new Error(`${name} deve ser numérico.`);
  return normalized;
}

function urlIdentity(url) {
  try {
    const parsed = new URL(url);
    const product = parsed.pathname.match(/\/product\/(\d+)\/(\d+)/iu);
    if (product) return { shopId: product[1], itemId: product[2] };
    const dotted = parsed.pathname.match(/\.([0-9]+)\.([0-9]+)(?:[/?]|$)/u);
    return dotted ? { shopId: dotted[1], itemId: dotted[2] } : null;
  } catch {
    return null;
  }
}

function htmlHasIdentity(html, shopId, itemId) {
  const text = String(html || '');
  const shopKey = '(?:"?shop(?:Id|_id)"?)';
  const itemKey = '(?:"?item(?:Id|_id)"?)';
  const shopValue = `(?:${shopKey})\\s*:\\s*"?${shopId}`;
  const itemValue = `(?:${itemKey})\\s*:\\s*"?${itemId}`;
  const objectPattern = new RegExp(`${shopValue}[\\s\\S]*${itemValue}|${itemValue}[\\s\\S]*${shopValue}`, 'iu');
  return [...text.matchAll(/\{[^{}]*\}/gu)].some((match) => objectPattern.test(match[0]));
}

function baseResult(shopId, itemId, status, failureReason = null) {
  return {
    status,
    shopId,
    itemId,
    videoUrl: null,
    source: null,
    identityValidated: false,
    failureReason,
    downloadPossible: false,
  };
}

function parseShopeeVideoPage(html, { shopId, itemId, canonicalUrl, finalUrl = canonicalUrl }) {
  const expectedShopId = normalizeId(shopId, 'shopId');
  const expectedItemId = normalizeId(itemId, 'itemId');
  let transport = 'http';
  const canonicalIdentity = urlIdentity(canonicalUrl);
  const finalIdentity = urlIdentity(finalUrl);
  const urlValid = [canonicalIdentity, finalIdentity].every((identity) => identity?.shopId === expectedShopId && identity?.itemId === expectedItemId);
  const htmlValid = htmlHasIdentity(html, expectedShopId, expectedItemId);
  if (!urlValid || !htmlValid) return baseResult(expectedShopId, expectedItemId, 'identity_mismatch', 'PAGE_IDENTITY_NOT_PROVEN');

  const candidate = findVideoCandidateFromHtml(html);
  if (!candidate) return { ...baseResult(expectedShopId, expectedItemId, 'no_video', 'VIDEO_NOT_FOUND'), identityValidated: true };
  return {
    ...baseResult(expectedShopId, expectedItemId, 'found'),
    videoUrl: candidate.videoUrl,
    source: candidate.source,
    identityValidated: true,
  };
}

async function defaultFetchHtml(url) {
  const response = await axios.get(url, {
    timeout: 30_000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: { 'User-Agent': 'caca-oferta-shopee-collector/1.0' },
  });
  return {
    status: response.status,
    finalUrl: response.request?.res?.responseUrl || url,
    html: typeof response.data === 'string' ? response.data : String(response.data || ''),
  };
}

async function defaultValidateVideoUrl(url) {
  const response = await axios.head(url, { timeout: 20_000, maxRedirects: 5, validateStatus: () => true });
  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  return {
    valid: response.status >= 200 && response.status < 300 && (contentType.startsWith('video/') || /\.mp4(?:$|[?#])/iu.test(url)),
    status: response.status,
    contentType,
    contentLength: response.headers?.['content-length'] || null,
    finalUrl: response.request?.res?.responseUrl || url,
  };
}

function findBrowserExecutable() {
  const candidates = [
    process.env.SHOPEE_CHROME_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function browserLaunchOptions(executablePath = findBrowserExecutable()) {
  return executablePath ? { headless: true, executablePath } : { headless: true };
}

async function loadWithPlaywright(url) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return { status: response?.status() || 200, finalUrl: page.url(), html: await page.content() };
  } finally {
    await browser.close();
  }
}

async function collectShopeeProductVideo({ shopId, itemId, canonicalUrl, fetchHtml = defaultFetchHtml, validateVideoUrl = defaultValidateVideoUrl, browserFallback = false, browserFetchHtml = loadWithPlaywright }) {
  const expectedShopId = normalizeId(shopId, 'shopId');
  const expectedItemId = normalizeId(itemId, 'itemId');
  let page;
  try {
    page = await fetchHtml(canonicalUrl);
  } catch (error) {
    return baseResult(expectedShopId, expectedItemId, 'extraction_failed', error.code || 'PAGE_REQUEST_FAILED');
  }

  const isBlocked = [403, 429].includes(Number(page.status));
  if (isBlocked && browserFallback) {
    try {
      page = await browserFetchHtml(canonicalUrl);
      transport = 'browser';
    } catch (error) {
      return baseResult(expectedShopId, expectedItemId, 'blocked', `BROWSER_${error.code || 'FAILED'}`);
    }
  }
  if ([403, 429].includes(Number(page.status))) return baseResult(expectedShopId, expectedItemId, 'blocked', `HTTP_${page.status}`);
  if (Number(page.status) < 200 || Number(page.status) >= 400) return baseResult(expectedShopId, expectedItemId, 'extraction_failed', `HTTP_${page.status}`);

  let parsed = parseShopeeVideoPage(page.html, { shopId: expectedShopId, itemId: expectedItemId, canonicalUrl, finalUrl: page.finalUrl });
  if (parsed.status === 'identity_mismatch' && browserFallback && !isBlocked) {
    try {
      page = await browserFetchHtml(canonicalUrl);
      transport = 'browser';
    } catch (error) {
      return baseResult(expectedShopId, expectedItemId, 'blocked', `BROWSER_${error.code || 'FAILED'}`);
    }
    if ([403, 429].includes(Number(page.status))) return baseResult(expectedShopId, expectedItemId, 'blocked', `HTTP_${page.status}`);
    parsed = parseShopeeVideoPage(page.html, { shopId: expectedShopId, itemId: expectedItemId, canonicalUrl, finalUrl: page.finalUrl });
  }
  if (parsed.status !== 'found') return parsed;
  let validation;
  try {
    validation = await validateVideoUrl(parsed.videoUrl);
  } catch (error) {
    return { ...parsed, status: 'extraction_failed', failureReason: error.code || 'VIDEO_URL_VALIDATION_FAILED' };
  }
  if (!validation?.valid) return { ...parsed, status: 'extraction_failed', failureReason: 'VIDEO_URL_INVALID', downloadPossible: false };
  return { ...parsed, source: `${transport}:${parsed.source}`, downloadPossible: true, videoValidation: validation };
}

module.exports = { collectShopeeProductVideo, parseShopeeVideoPage, htmlHasIdentity, urlIdentity, browserLaunchOptions };
