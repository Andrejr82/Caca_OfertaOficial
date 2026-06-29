require('dotenv').config({ path: '.env.local' });
const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());
const fs = require('fs');

async function diagnosticar(storeName, targetUrl, useScrapfly) {
  console.log(`\n=== INICIANDO DIAGNÓSTICO: ${storeName} (Scrapfly: ${useScrapfly}) ===`);
  let proxy = undefined;
  if (useScrapfly) {
    const keysRaw = process.env.SCRAPFLY_API_KEYS || process.env.SCRAPFLY_API_KEY;
    if (!keysRaw) throw new Error("Sem chave do Scrapfly");
    const key = keysRaw.split(',')[0].trim();
    // Use proper proxy format for playwright
    proxy = { server: `http://proxy.scrapfly.io:8080`, username: key, password: "asp=true&country=br" };
    console.log(`Using proxy with key: ${key.substring(0, 10)}...`);
  }

  const browser = await chromium.launch({
    headless: true,
    proxy: proxy,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--no-first-run', '--mute-audio']
  });

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Bloqueio de mídia
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) route.abort();
    else route.continue();
  });

  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

  let statusHttp = null;
  page.on('response', response => {
    if (response.url() === targetUrl || response.url().includes(targetUrl.split('?')[0])) {
      if (!statusHttp) statusHttp = response.status();
    }
  });

  console.log(`Navegando para: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log("Goto timeout"));
  await page.waitForTimeout(5000);

  const finalUrl = page.url();
  const title = await page.title();
  const html = await page.content();
  const rawSize = html.length;

  const prefix = `${storeName.replace(' ', '')}_${useScrapfly ? 'Scrapfly' : 'Notebook'}`;
  await page.screenshot({ path: `${prefix}_screenshot.png` });
  fs.writeFileSync(`${prefix}_source.html`, html);

  const evalResult = await page.evaluate((storeName) => {
    let items = [];
    if (storeName === 'Mercado Livre') {
      items = Array.from(document.querySelectorAll('.ui-search-layout__item, .poly-card'));
    } else if (storeName === 'Magalu') {
      items = Array.from(document.querySelectorAll('[data-testid="product-card"]'));
    }
    let results = [];
    for (let el of items) {
      if ((el.innerText||'').match(/R\$\s*[\d,.]+/)) results.push(el.innerText);
    }
    return { found: items.length, valid: results.length };
  }, storeName);

  await browser.close();

  let classificacao = "J) Outro";
  if (evalResult.found > 0) classificacao = "A) Página normal";
  else if (html.includes('Cloudflare') || title.includes('Just a moment')) classificacao = "B) Cloudflare";
  else if (html.includes('datadome') || html.includes('geo.captcha')) classificacao = "C) Datadome";
  else if (html.includes('verifique se você não é um robô') || finalUrl.includes('account-verification') || title.includes('Mercado Libre')) classificacao = "D) Mercado Livre AntiBot";
  else if (rawSize < 1000) classificacao = "E) Página vazia";
  else if (statusHttp === 403 || statusHttp === 407) classificacao = "H) Timeout / Acesso Negado Proxy";

  console.log(`
--- RESULTADO ---
Store: ${storeName}
Modo: ${useScrapfly ? 'Scrapfly Proxy' : 'Notebook Local'}
Status HTTP: ${statusHttp}
URL Final: ${finalUrl}
Título: ${title}
Tamanho HTML: ${rawSize} bytes
Seletores encontrados: ${evalResult.found}
Cards Válidos: ${evalResult.valid}

CENÁRIO DETECTADO: ${classificacao}
-----------------
  `);

  return { storeName, useScrapfly, statusHttp, classificacao, found: evalResult.found, rawSize };
}

(async () => {
  const results = [];
  try {
    results.push(await diagnosticar('Mercado Livre', 'https://lista.mercadolivre.com.br/sabao-em-po-omo', true));
    results.push(await diagnosticar('Magalu', 'https://www.magazineluiza.com.br/busca/sabao-em-po-omo/', true));
  } catch(e) {
    console.error("Erro no diagnostico:", e);
  }
})();
