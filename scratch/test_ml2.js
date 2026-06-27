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
    const allA = Array.from(document.querySelectorAll('a'));
    const samples = allA.slice(0, 30).map(a => ({
      text: a.innerText,
      html: a.innerHTML.substring(0, 100),
      hasRsTextContent: a.textContent.includes('R$'),
      hasRsInnerText: a.innerText.includes('R$')
    }));
    return { samples };
  });

  console.log('Samples:', JSON.stringify(data.samples, null, 2));
  await browser.close();
})();
