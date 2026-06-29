const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

(async () => {
  console.log("Iniciando Chromium com Stealth...");
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  console.log("Navegando para Mercado Livre...");
  await page.goto('https://lista.mercadolivre.com.br/smartphone', { waitUntil: 'domcontentloaded' });
  
  console.log("Aguardando 5 segundos...");
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  const title = await page.title();
  
  console.log("Título da página:", title);
  if (title.toLowerCase().includes('login') || title.toLowerCase().includes('captcha')) {
    console.log("🔴 Fomos bloqueados (Login / Captcha).");
  } else {
    console.log("🟢 Página carregada normalmente.");
  }
  
  const polyCards = await page.$$('.poly-card');
  const uiItems = await page.$$('.ui-search-layout__item');
  
  console.log(`Encontrados: ${polyCards.length} .poly-card`);
  console.log(`Encontrados: ${uiItems.length} .ui-search-layout__item`);
  
  await browser.close();
})();
