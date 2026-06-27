const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.mercadolivre.com.br/ofertas?q=Azeite%20Gallo');
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const symbol = document.querySelector('.andes-money-amount__currency-symbol');
    if (!symbol) return { found: false };
    
    // Let's traverse up the DOM tree and print parents and siblings
    let current = symbol;
    const path = [];
    for (let i = 0; i < 5 && current; i++) {
      path.push({
        tagName: current.tagName,
        className: current.className,
        outerHTMLSnippet: current.outerHTML.substring(0, 200)
      });
      current = current.parentElement;
    }
    return { found: true, path };
  });

  console.log('DOM Path:', JSON.stringify(data, null, 2));
  await browser.close();
})();
