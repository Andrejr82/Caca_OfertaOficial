require('dotenv').config({ path: '.env.local' });
const axios = require('axios');
const cheerio = require('cheerio');

async function testScrapflyAPI() {
  const keys = (process.env.SCRAPFLY_API_KEYS || "").split(",").map(k => k.trim()).filter(k => k);
  if (keys.length === 0) {
    console.error("❌ SCRAPFLY_API_KEYS não encontrada no .env.local!");
    process.exit(1);
  }
  
  const targetUrl = 'https://lista.mercadolivre.com.br/smartphone';
  
  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    console.log(`\n🔑 Testando Chave ${i + 1} de ${keys.length}...`);
    
    try {
      const response = await axios.get('https://api.scrapfly.io/scrape', {
        params: {
          key: apiKey,
          url: targetUrl,
          asp: 'true',
          country: 'br',
          render_js: 'true'
        }
      });

      const html = response.data.result.content;
      if (!html) {
        console.log("❌ Sucesso HTTP, mas sem HTML.");
        continue;
      }

      console.log(`✅ CHAVE ${i + 1} FUNCIONOU! Tamanho: ${html.length} bytes`);
      
      const $ = cheerio.load(html);
      const items = $('.poly-card, .ui-search-layout__item, div.ui-search-result');
      console.log(`🔎 Itens encontrados: ${items.length}`);
      return; // Sai do script se funcionar

    } catch (err) {
      if (err.response && err.response.status === 429) {
        console.error(`❌ Chave ${i + 1} Esgotada (Quota Limit Reached)`);
      } else if (err.response) {
        console.error(`❌ Erro na Chave ${i + 1}: ${err.response.status}`);
      } else {
        console.error(`❌ Erro fatal: ${err.message}`);
      }
    }
  }
  
  console.log("\n🚨 Todas as chaves foram testadas e estão esgotadas ou inválidas.");
}

testScrapflyAPI();
