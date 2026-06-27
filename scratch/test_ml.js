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
  const response = await page.goto('https://www.mercadolivre.com.br/ofertas?q=Azeite%20Gallo');
  console.log('Response Status:', response ? response.status() : 'No response');
  
  await page.waitForTimeout(6000);

  const pageDetails = await page.evaluate(() => {
    const title = document.title;
    const bodyTextLength = document.body ? document.body.innerText.length : 0;
    const linksCount = document.querySelectorAll('a').length;
    const divsCount = document.querySelectorAll('div').length;
    
    // Check if the word "R$" is present anywhere on the page
    const hasRs = document.body ? document.body.innerText.includes('R$') : false;
    
    return { title, bodyTextLength, linksCount, divsCount, hasRs };
  });

  console.log('Page Details:', pageDetails);
  
  await browser.close();
})();
