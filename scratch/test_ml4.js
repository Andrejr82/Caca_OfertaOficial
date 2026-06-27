const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.mercadolivre.com.br/ofertas?q=Azeite%20Gallo');
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const allA = Array.from(document.querySelectorAll('a'));
    const matches = [];
    for (let a of allA) {
      if (a.textContent.includes('R$')) {
        matches.push({
          href: a.href,
          textContent: a.textContent.trim().substring(0, 150),
          innerText: a.innerText.trim().substring(0, 150),
          innerHTML: a.innerHTML.substring(0, 150)
        });
      }
    }
    return { count: allA.length, matchesCount: matches.length, matches: matches.slice(0, 10) };
  });

  console.log('Results:', JSON.stringify(data, null, 2));
  await browser.close();
})();
