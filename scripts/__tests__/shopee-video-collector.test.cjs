const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectShopeeProductVideo,
  browserLaunchOptions,
  parseShopeeVideoPage,
} = require('../shopee-video-collector.cjs');

const identity = { shopId: '123', itemId: '456' };
const canonicalUrl = 'https://shopee.com.br/product/123/456';
const identityMarkup = (body) => `
  <script>window.__PRODUCT__ = {"shopId":"123","itemId":"456"};</script>
  ${body}
`;

test('finds MP4 from video.src before other sources', () => {
  const result = parseShopeeVideoPage(identityMarkup('<video src="https://cdn.test/first.mp4"></video><source src="https://cdn.test/second.mp4">'), {
    ...identity,
    canonicalUrl,
    finalUrl: canonicalUrl,
  });
  assert.equal(result.identityValidated, true);
  assert.equal(result.videoUrl, 'https://cdn.test/first.mp4');
  assert.equal(result.source, 'video.src');
});

test('finds MP4 from source.src when video has no direct source', () => {
  const result = parseShopeeVideoPage(identityMarkup('<video><source src="https://cdn.test/source.mp4"></video>'), {
    ...identity,
    canonicalUrl,
    finalUrl: canonicalUrl,
  });
  assert.equal(result.videoUrl, 'https://cdn.test/source.mp4');
  assert.equal(result.source, 'source.src');
});

test('finds MP4 from video_info_list in inline JSON', () => {
  const result = parseShopeeVideoPage(identityMarkup('<script>const data={video_info_list:[{"video_url":"https://cdn.test/json.mp4"}]}</script>'), {
    ...identity,
    canonicalUrl,
    finalUrl: canonicalUrl,
  });
  assert.equal(result.videoUrl, 'https://cdn.test/json.mp4');
  assert.equal(result.source, 'json.video_info_list');
});

test('rejects page identity mismatch before accepting MP4', () => {
  const result = parseShopeeVideoPage('<script>window.__PRODUCT__={"shopId":"999","itemId":"456"}</script><video src="https://cdn.test/wrong.mp4"></video>', {
    ...identity,
    canonicalUrl,
    finalUrl: 'https://shopee.com.br/product/999/456',
  });
  assert.equal(result.identityValidated, false);
  assert.equal(result.status, 'identity_mismatch');
  assert.equal(result.videoUrl, null);
});

test('rejects IDs that are present separately instead of in one metadata object', () => {
  const result = parseShopeeVideoPage('<script>const shop={"shopId":"123"}; const item={"itemId":"456"};</script><video src="https://cdn.test/separate.mp4"></video>', {
    ...identity,
    canonicalUrl,
    finalUrl: canonicalUrl,
  });
  assert.equal(result.status, 'identity_mismatch');
  assert.equal(result.videoUrl, null);
});

test('returns no_video when identity is proven but page has no MP4', async () => {
  const result = await collectShopeeProductVideo({
    ...identity,
    canonicalUrl,
    fetchHtml: async () => ({ status: 200, finalUrl: canonicalUrl, html: identityMarkup('<main>produto sem vídeo</main>') }),
    validateVideoUrl: async () => ({ valid: true }),
  });
  assert.equal(result.status, 'no_video');
  assert.equal(result.identityValidated, true);
  assert.equal(result.failureReason, 'VIDEO_NOT_FOUND');
});

test('returns blocked for HTTP anti-bot response', async () => {
  const result = await collectShopeeProductVideo({
    ...identity,
    canonicalUrl,
    fetchHtml: async () => ({ status: 403, finalUrl: canonicalUrl, html: '' }),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.identityValidated, false);
  assert.equal(result.failureReason, 'HTTP_403');
});

test('uses browser fallback when HTTP 200 does not prove page identity', async () => {
  const result = await collectShopeeProductVideo({
    ...identity,
    canonicalUrl,
    browserFallback: true,
    fetchHtml: async () => ({ status: 200, finalUrl: canonicalUrl, html: '<title>Verificação</title>' }),
    browserFetchHtml: async () => ({ status: 200, finalUrl: canonicalUrl, html: identityMarkup('<video src="https://cdn.test/browser.mp4"></video>') }),
    validateVideoUrl: async () => ({ valid: true, status: 200, contentType: 'video/mp4' }),
  });
  assert.equal(result.status, 'found');
  assert.equal(result.source, 'browser:video.src');
  assert.equal(result.identityValidated, true);
});

test('replays the same response deterministically', async () => {
  const fetchHtml = async () => ({ status: 200, finalUrl: canonicalUrl, html: identityMarkup('<video src="https://cdn.test/replay.mp4"></video>') });
  const options = { ...identity, canonicalUrl, fetchHtml, validateVideoUrl: async () => ({ valid: true, contentType: 'video/mp4', status: 200 }) };
  const first = await collectShopeeProductVideo(options);
  const second = await collectShopeeProductVideo(options);
  assert.deepEqual(second, first);
});

test('passes a configured real browser executable to Playwright', () => {
  assert.deepEqual(browserLaunchOptions('C:/Program Files/Google/Chrome/Application/chrome.exe'), {
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
});
