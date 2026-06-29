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
            const linkTag = el.tagName === 'A' ? el : el.querySelector('a');
            const imgTag = el.querySelector('img.s-image') || el.querySelector('img.ui-search-result-image__element') || el.querySelector('img[data-testid="image"]') || el.querySelector('img');
            const url = linkTag ? linkTag.href : '';
            let img = '';
            if (imgTag) img = imgTag.getAttribute('src') || '';
            if (url) results.push(`[TEXTO]: ${text.replace(/\n/g, ' ')} | [LINK]: ${url} | [IMG]: ${img}`);
          }
        }
        const unique = [];
        const seen = new Set();
        for(let r of results) {
          const u = r.match(/\[LINK\]: (.*?)(?: \||$)/)?.[1];
          if(u && !seen.has(u)){ seen.add(u); unique.push(r); }
        }
        return { 
          textLength: unique.slice(0, 15).join('\n').length, 
          itemCount: unique.length,
          firstItemText: unique[0] ? unique[0].substring(0, 200) : '' 
        };
    });
    console.log(evalResult);
  }
});
crawler.run(['https://www.amazon.com.br/s?k=iphone']);
