const { PlaywrightCrawler } = require('crawlee');
const crawler = new PlaywrightCrawler({
  maxConcurrency: 1,
  browserPoolOptions: { useFingerprints: true },
  launchContext: { launchOptions: { headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--no-first-run', '--mute-audio'] } },
  async requestHandler({ request, page }) {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    await page.waitForTimeout(2000);
    const html = await page.content();
    console.log('HTML size:', html.length);
    console.log('Title:', await page.title());
    const evalResult = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('div[data-testid="product-card"]'));
        return { found: items.length };
    });
    console.log(evalResult);
  }
});
crawler.run(['https://www.magazineluiza.com.br/busca/air%20fryer/']);
