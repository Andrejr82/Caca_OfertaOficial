require('dotenv').config({ path: '.env.local' });
const axios = require('axios');
const cheerio = require('cheerio');

async function testScrapeDo() {
  const apiKey = process.env.SCRAPEDO_API_KEY;
  
  if (!apiKey) {
    console.error("❌ SCRAPEDO_API_KEY não encontrada no .env.local!");
    console.log("👉 Adicione a chave no seu .env.local: SCRAPEDO_API_KEY=sua-chave-aqui");
    process.exit(1);
  }
  
  const targetUrl = 'https://lista.mercadolivre.com.br/smartphone';
  
  console.log(`🤖 Iniciando teste na API da Scrape.do para: ${targetUrl}`);
  console.log(`⏳ Aguardando processamento da nuvem...`);
  
  try {
    const response = await axios.get('http://api.scrape.do', {
      params: {
        token: apiKey,
        url: targetUrl,
        geoCode: 'br', // Proxy do Brasil
        super: 'true', // OBRIGATÓRIO: Força proxy Residencial/Mobile premium
        render: 'false' // Tenta sem render para não chamar atenção
      }
    });

    const html = response.data;
    if (!html || html.length < 500) {
      console.log("❌ Sucesso HTTP, mas retornou um HTML suspeitamente pequeno (Captcha?).");
      return;
    }

    console.log(`✅ SCAPE.DO FUNCIONOU! HTML recebido: ${html.length} bytes`);
    
    // Processamento Local (Parser)
    const $ = cheerio.load(html);
    const items = $('.poly-card, .ui-search-layout__item, div.ui-search-result');
    console.log(`\n🔎 Itens encontrados no DOM: ${items.length}\n`);

    items.each((i, el) => {
      const title = $(el).find('h2.poly-box, h2.ui-search-item__title, .poly-component__title').text().trim();
      let priceText = $(el).find('.poly-price__current .andes-money-amount__fraction, .ui-search-price--size-medium .andes-money-amount__fraction').first().text().trim();
      if (!priceText) {
        priceText = $(el).find('.andes-money-amount__fraction').first().text().trim();
      }

      if (title && priceText) {
        console.log(`[Item ${i+1}] ${title.substring(0, 50)}... | Preço: R$ ${priceText}`);
      }
    });

    if (items.length === 0) {
      console.log("⚠️ Nenhum item processado com sucesso. Mercado Livre pode ter barrado a nuvem.");
      require('fs').writeFileSync('debug-scrapedo.html', html);
    }

  } catch (err) {
    if (err.response) {
      console.error(`❌ Erro na API Scrape.do: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    } else {
      console.error(`❌ Erro fatal: ${err.message}`);
    }
  }
}

testScrapeDo();
