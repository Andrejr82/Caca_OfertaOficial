const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) {
      console.log('Aborting:', route.request().url().substring(0, 60), `(${type})`);
      route.abort();
    } else {
      route.continue();
    }
  });

  await page.goto('https://www.mercadolivre.com.br/ofertas?q=Desodorante%20Rexona');
  
  const imgUrl = await page.evaluate(() => {
    const img = document.querySelector('img');
    return img ? img.src : null;
  });

  console.log('First Image URL from DOM:', imgUrl);
  await browser.close();
})();
