const { PlaywrightCrawler } = require('crawlee');
const crawler = new PlaywrightCrawler({
  maxConcurrency: 1,
  browserPoolOptions: { useFingerprints: true },
  launchContext: { launchOptions: { headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--no-first-run', '--mute-audio'] } },
  async requestHandler({ request, page }) {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    await page.waitForTimeout(2000);
    const evalResult = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('div[data-asin], div[data-component-type="s-search-result"], [data-testid="product-card"], .ui-search-layout__item, .poly-card, .promotion-item, .a-carousel-card, [data-csa-c-type="item"], .DealGridItem-module__dealItemContent_1vFdd'));
        let results = [];
        for (let el of items) {
          const text = el.innerText || '';
          if (text.includes('R$')) {
            results.push(text.split('\n').join(' | ').substring(0, 50));
          }
        }
        return { found: items.length, valid: results.length, firstFew: results.slice(0,3) };
    });
    console.log(evalResult);
  }
});
crawler.run(['https://lista.mercadolivre.com.br/sabao-em-po-omo']);
