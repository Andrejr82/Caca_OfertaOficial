const { chromium } = require('playwright');
require('dotenv').config({ path: '.env.local' });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-gpu',
      '--single-process',
      '--disable-blink-features=AutomationControlled',
      '--js-flags="--max-old-space-size=128"',
      '--disable-extensions',
      '--disable-default-apps',
      '--no-first-run',
      '--mute-audio'
    ]
  });
  const page = await browser.newPage();
  
  // Bloqueia imagens, fontes e mídia
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  console.log('Navigating to Mercado Livre...');
  await page.goto('https://www.mercadolivre.com.br/ofertas?q=Azeite%20Gallo');
  
  await page.waitForTimeout(6000);

  const rawExtractedData = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('a, div.ui-search-result, div[data-component-type="s-search-result"]'));
    let results = [];
    for (let el of items) {
      const text = el.innerText || '';
      if (text.includes('R$')) {
        const linkTag = el.tagName === 'A' ? el : el.querySelector('a');
        const imgTag = el.querySelector('img');
        const url = linkTag ? linkTag.href : '';
        const img = imgTag ? imgTag.src : '';
        if (url) {
          results.push(`[TEXTO]: ${text.replace(/\n/g, ' ')} | [LINK]: ${url} | [IMG]: ${img}`);
        }
      }
    }
    const unique = [];
    const seen = new Set();
    for(let r of results) {
      const u = r.match(/\[LINK\]: (.*?)(?: \||$)/)?.[1];
      if(u && !seen.has(u)){ seen.add(u); unique.push(r); }
    }
    return unique.slice(0, 20).join('\n');
  });

  console.log('Extracted Data Length:', rawExtractedData.length);
  console.log('Extracted Data Sample (first 500 chars):\n', rawExtractedData.substring(0, 500));
  
  await browser.close();
})();
