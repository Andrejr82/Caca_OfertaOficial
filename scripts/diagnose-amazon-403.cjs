require('dotenv').config({ path: '.env.local' });

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

const TESTS = [
  { label: 'Echo Pop', query: 'Echo Pop' },
  { label: 'Fralda Pampers', query: 'Fralda Pampers' },
  { label: 'Air Fryer', query: 'Air Fryer' },
];

const SCRAPFLY_KEYS = (process.env.SCRAPFLY_API_KEYS || process.env.SCRAPFLY_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

const AMAZON_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'sec-ch-ua': '"Chromium";v="138", "Not=A?Brand";v="24", "Google Chrome";v="138"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

function buildAmazonUrl(query) {
  return `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&rh=p_n_availability%3A2661601011`;
}

function buildMlUrl(query) {
  return `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`;
}

function detectBlock(html, finalUrl) {
  const text = (html || '').toLowerCase();
  const signals = [
    'captcha',
    'access denied',
    'forbidden',
    'verify you are human',
    'robot check',
    'digite os caracteres da imagem',
    'tráfego suspeito',
    'acesso negado',
    'sorry, we just need to make sure',
    'automated access',
  ].filter((s) => text.includes(s));

  return {
    blocked: signals.length > 0 || /\/errors\/validatecaptcha|\/captcha\//i.test(finalUrl || ''),
    signals,
  };
}

async function extractAmazonProducts(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('div[data-asin], div[data-component-type="s-search-result"]'));
    const valid = [];

    for (const el of items) {
      const asin = el.getAttribute('data-asin');
      const text = (el.innerText || '').trim();
      if (!asin || !text.includes('R$')) continue;
      const link = el.querySelector('h2 a, a.a-link-normal');
      valid.push({
        asin,
        title: (el.querySelector('h2 span, .a-size-base-plus, .a-size-medium')?.textContent || '').trim(),
        url: link ? link.href : null,
      });
    }

    return valid;
  });
}

async function inspectAmazonPage(page) {
  return page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      resultCount: document.querySelectorAll('div[data-asin], div[data-component-type="s-search-result"]').length,
      cardsWithPrice: Array.from(document.querySelectorAll('div[data-asin], div[data-component-type="s-search-result"]'))
        .filter((el) => (el.innerText || '').includes('R$')).length,
      searchContainer: !!document.querySelector('[data-component-type="s-search-result"], [data-asin], .s-main-slot'),
      hasCaptchaInput: !!document.querySelector('input[name="field-keywords"], input[name="cvf_captcha_input"], img[alt*="captcha" i]'),
      bodySnippet: bodyText.slice(0, 1200),
    };
  });
}

async function extractMlProducts(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.ui-search-layout__item, .poly-card'));
    return items
      .map((el) => ({
        title: (el.querySelector('.poly-component__title, .ui-search-item__title')?.textContent || '').trim(),
        price: (el.innerText || '').includes('R$'),
      }))
      .filter((p) => p.title && p.price);
  });
}

async function runAmazonTest(browser, test) {
  const context = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: AMAZON_HEADERS,
  });

  const page = await context.newPage();
  const targetUrl = buildAmazonUrl(test.query);
  const redirects = [];
  let mainResponse = null;
  let documentRequestHeaders = null;

  page.on('response', async (response) => {
    if (response.request().resourceType() !== 'document') return;
    const req = response.request();
    if (req.url() === targetUrl || req.isNavigationRequest()) {
      redirects.push({
        url: response.url(),
        status: response.status(),
      });
      if (!mainResponse && response.frame() === page.mainFrame()) {
        mainResponse = response;
        documentRequestHeaders = req.headers();
      }
    }
  });

  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) return route.abort();
    return route.continue();
  });

  let gotoError = null;
  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (response) {
      mainResponse = response;
      documentRequestHeaders = response.request().headers();
    }
    await page.waitForTimeout(4000);
  } catch (err) {
    gotoError = err.message;
  }

  const finalUrl = page.url();
  const html = await page.content().catch(() => '');
  const title = await page.title().catch(() => '');
  const pageInspection = await inspectAmazonPage(page).catch(() => null);
  const block = detectBlock(html, finalUrl);
  const products = block.blocked ? [] : await extractAmazonProducts(page).catch(() => []);

  await context.close();

  return {
    marketplace: 'Amazon',
    query: test.query,
    targetUrl,
    finalUrl,
    title,
    status: mainResponse ? mainResponse.status() : null,
    headersSent: documentRequestHeaders,
    redirects,
    blocked: block.blocked,
    blockSignals: block.signals,
    pageInspection,
    extractedProducts: products.length,
    sampleProducts: products.slice(0, 3),
    gotoError,
  };
}

async function createBrowser(proxy) {
  return chromium.launch({
    headless: true,
    proxy,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--mute-audio',
    ],
  });
}

async function runMlSmoke(defaultBrowser) {
  const useProxy = process.platform !== 'win32' && SCRAPFLY_KEYS.length > 0;
  const proxyBrowser = useProxy
    ? await createBrowser({
        server: 'http://proxy.scrapfly.io:8080',
        username: SCRAPFLY_KEYS[0],
        password: 'asp=true&country=br',
      })
    : null;
  const browser = proxyBrowser || defaultBrowser;
  const context = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  const targetUrl = buildMlUrl('Echo Pop');
  let status = null;
  let finalUrl = targetUrl;
  let gotoError = null;

  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    status = response ? response.status() : null;
    await page.waitForTimeout(3000);
    finalUrl = page.url();
  } catch (err) {
    gotoError = err.message;
  }

  const products = await extractMlProducts(page).catch(() => []);
  await context.close();
  if (proxyBrowser) await proxyBrowser.close();

  return {
    marketplace: 'Mercado Livre',
    query: 'Echo Pop',
    targetUrl,
    finalUrl,
    status,
    usedProxy: useProxy,
    gotoError,
    extractedProducts: products.length,
    sampleProducts: products.slice(0, 3),
  };
}

async function main() {
  const browser = await createBrowser();

  try {
    const results = [];
    for (const test of TESTS) {
      results.push(await runAmazonTest(browser, test));
    }
    const mlSmoke = await runMlSmoke(browser);

    const report = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      node: process.version,
      amazon: results,
      mercadoLivreSmoke: mlSmoke,
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ fatal: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
