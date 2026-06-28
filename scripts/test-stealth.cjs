const { PlaywrightCrawler } = require('crawlee');
const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());

async function runTest() {
    console.log('🚀 Iniciando Teste Stealth no Mercado Livre...');
    let products = [];

    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        browserPoolOptions: {
            useFingerprints: false, // DESATIVADO para não conflitar
        },
        launchContext: {
            useIncognitoPages: false, // Necessário
            launcher: chromium,
            launchOptions: {
                headless: true,
                args: [
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-gpu',
                    '--disable-blink-features=AutomationControlled',
                ]
            }
        },
        async requestHandler({ request, page, log }) {
            log.info(`Acessando a página: ${request.url}...`);
            await page.waitForTimeout(5000);
            log.info('Extraindo elementos da tela...');
            
            const isML = request.url.includes('mercadolivre.com.br');
            
            const evalResult = await page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('div[data-asin], div[data-component-type="s-search-result"], [data-testid="product-card"], .ui-search-layout__item'));
                let results = [];
                for (let el of items) {
                  const text = el.innerText || '';
                  if (text.includes('R$')) {
                    const linkTag = el.tagName === 'A' ? el : el.querySelector('a');
                    const imgTag = el.querySelector('img.s-image') || el.querySelector('img.ui-search-result-image__element') || el.querySelector('img[data-testid="image"]') || el.querySelector('img');
                    const url = linkTag ? linkTag.href : '';
                    let img = '';
                    if (imgTag) {
                      const dyn = imgTag.getAttribute('data-a-dynamic-image');
                      if (dyn) {
                        try { img = Object.keys(JSON.parse(dyn))[0]; } catch(e){}
                      }
                      if (!img) img = imgTag.getAttribute('data-src');
                      if (!img) {
                        const srcset = imgTag.getAttribute('srcset');
                        if (srcset) img = srcset.split(' ')[0];
                      }
                      if (!img) img = imgTag.getAttribute('src');
                      if (!img) img = imgTag.src || '';
                      
                      if (img.startsWith('data:image') || img.includes('base64') || img.includes('svg') || img.includes('placeholder')) {
                        img = '';
                      }
                    }
                    if (url) {
                      results.push(`🚨 *NOVO ACHADINHO!*\n\n${text.replace(/\n/g, ' ')}\n\n🖼️ IMAGEM: ${img}\n🔗 COMPRAR: ${url}\n------------------------`);
                    }
                  }
                }
                return results;
            });
            products = evalResult.slice(0, 5);
            
            log.info(`✅ Encontrados ${products.length} produtos.`);
        }
    });

    const testUrl = 'https://lista.mercadolivre.com.br/fralda-pampers';
    await crawler.addRequests([testUrl]);
    
    await crawler.run();
    console.log('\n--- RESULTADO DO TESTE ---');
    console.log('Produtos Extraídos:');
    console.log(JSON.stringify(products, null, 2));
}

runTest().catch(console.error);
