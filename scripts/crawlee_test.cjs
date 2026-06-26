const { PlaywrightCrawler } = require('crawlee');
require('dotenv').config({ path: '.env.local' });

// Configurações extremas de memória
process.env.CRAWLEE_MEMORY_MBYTES = '400';

async function runTest() {
    console.log('🚀 Iniciando Teste Isolado do Crawlee na Oracle...');
    
    let products = [];

    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        launchContext: {
            launchOptions: {
                headless: true,
                args: [
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-gpu',
                    '--single-process',
                    '--disable-setuid-sandbox',
                    '--no-zygote'
                ]
            }
        },
        async requestHandler({ request, page, log }) {
            log.info(`Acessando a página: ${request.url}...`);
            
            // Espera a página carregar (simulando Firecrawl waitFor: 8000)
            await page.waitForTimeout(5000);
            
            // Tenta pegar produtos do Mercado Livre (classe poly-card__content) ou Amazon
            log.info('Extraindo elementos da tela...');
            
            const isML = request.url.includes('mercadolivre.com.br');
            
            if (isML) {
                products = await page.$$eval('.ui-search-result__content-wrapper', items => {
                    return items.map(item => {
                        const title = item.querySelector('h2.ui-search-item__title')?.innerText;
                        const price = item.querySelector('.andes-money-amount__fraction')?.innerText;
                        const link = item.querySelector('a.ui-search-item__group__element')?.href;
                        return { title, price, link };
                    }).slice(0, 5); // Pegar os 5 primeiros
                });
            } else {
                products = await page.$$eval('[data-component-type="s-search-result"]', items => {
                    return items.map(item => {
                        const title = item.querySelector('h2 a span')?.innerText;
                        const price = item.querySelector('.a-price-whole')?.innerText;
                        const link = item.querySelector('h2 a')?.href;
                        return { title, price, link };
                    }).slice(0, 5);
                });
            }
            
            log.info(`✅ Encontrados ${products.length} produtos.`);
        },
        failedRequestHandler({ request, log }) {
            log.error(`Falha ao carregar ${request.url}`);
        }
    });

    const testUrl = 'https://lista.mercadolivre.com.br/fralda-pampers';
    
    await crawler.addRequests([testUrl]);
    
    const startTime = Date.now();
    await crawler.run();
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n--- RESULTADO DO TESTE ---');
    console.log(`Tempo de execução: ${duration} segundos`);
    console.log('Produtos Extraídos:');
    console.log(JSON.stringify(products, null, 2));
    console.log('--------------------------\n');
}

runTest().catch(console.error);
