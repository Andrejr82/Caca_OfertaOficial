const fs = require('fs');
const { PlaywrightCrawler, chromium } = require('crawlee');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());

async function fetchPages() {
  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    launchContext: {
      launcher: chromium,
      launchOptions: { headless: true }
    },
    async requestHandler({ request, page }) {
      console.log(`Buscando ${request.url}...`);
      await page.waitForTimeout(3000); // Wait for initial load
      const html = await page.content();
      const domain = new URL(request.url).hostname.replace('www.', '').split('.')[0];
      fs.writeFileSync(`scratch/${domain}.html`, html);
      console.log(`Salvo scratch/${domain}.html`);
    }
  });

  await crawler.run([
    'https://www.mercadolivre.com.br/ofertas?q=iphone',
    'https://www.amazon.com.br/s?k=iphone',
    'https://www.magazineluiza.com.br/busca/iphone/'
  ]);
}

fetchPages().catch(console.error);
