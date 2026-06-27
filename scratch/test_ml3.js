const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
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

  await page.goto('https://www.mercadolivre.com.br/ofertas?q=Azeite%20Gallo');
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const elementsWithRs = [];
    for (let el of elements) {
      if (el.children.length === 0 && el.textContent.includes('R$')) {
        elementsWithRs.push({
          tagName: el.tagName,
          className: el.className,
          text: el.textContent.trim().substring(0, 100)
        });
      }
    }
    return { elementsWithRs };
  });

  console.log('Elements containing R$:', JSON.stringify(data.elementsWithRs, null, 2));
  await browser.close();
})();
