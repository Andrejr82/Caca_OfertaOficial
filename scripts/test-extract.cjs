const { PlaywrightCrawler } = require('crawlee');
const { chromium } = require('playwright');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

process.env.CRAWLEE_MEMORY_MBYTES = '3072';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function testExtract(url, storeName) {
  let rawExtractedData = '';

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 60,
    navigationTimeoutSecs: 45,
    launchContext: {
      launcher: chromium,
      launchOptions: {
        headless: true,
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--js-flags="--max-old-space-size=128"',
          '--disable-extensions',
          '--disable-default-apps',
          '--no-first-run',
          '--mute-audio'
        ]
      }
    },
    async requestHandler({ request, page, log }) {
      log.info(`[Test] Raspando: ${request.url}`);
      
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'font', 'media'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      await page.waitForTimeout(6000); 
      await page.screenshot({ path: 'screenshot.png', fullPage: true });
      const fs = require('fs');
      fs.writeFileSync('page.html', await page.content());

      rawExtractedData = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('a, div.ui-search-result, div[data-component-type="s-search-result"]'));
        let results = [];
        for (let el of items) {
          const text = el.innerText || '';
          if (text.includes('R$')) {
            const linkTag = el.tagName === 'A' ? el : el.querySelector('a');
            const imgTag = el.querySelector('img');
            const url = linkTag ? linkTag.href : '';
            
            let img = '';
            if (imgTag) {
              img = imgTag.getAttribute('data-src') || imgTag.getAttribute('src') || imgTag.src || '';
            }

            if (url && text.trim().length > 10) {
              results.push(`[TEXTO]: ${text.replace(/\n/g, ' ')} | [LINK]: ${url} | [IMG]: ${img}`);
            }
          }
        }
        
        const unique = [];
        const seen = new Set();
        for(let r of results) {
          const u = r.match(/\[LINK\]: (.*?)(?: \||$)/)?.[1];
          if(u && !seen.has(u)){ seen.add(u); unique.push(r); }
        }
        return unique.slice(0, 5).join('\n');
      });
    }
  });

  console.log(`🚀 Iniciando Crawler Teste para ${storeName}`);
  await crawler.run([url]);

  if (!rawExtractedData) {
    console.log("❌ Nenhum dado bruto extraído.");
    return;
  }
  console.log("✅ Dados brutos extraídos:\n", rawExtractedData);

  const prompt = `Você é um extrator de dados. Analise esta lista de produtos encontrados na loja ${storeName}.
Identifique as melhores ofertas e monte um JSON APENAS com os produtos válidos (que tenham nome e preço).
Se houver preço cortado (ex: de R$ 100 por R$ 50), coloque 100 em old_price e 50 em price.

Schema JSON Obrigatório:
{
  "products": [
    {
      "title": "Nome limpo do produto",
      "url": "O link absoluto exato da extração",
      "image": "O link da imagem se houver, ou null",
      "price": 199.90,
      "old_price": 299.90,
      "category": "${storeName}",
      "rating": 4.5
    }
  ]
}`;

  console.log(`🧠 Acionando Groq para estruturar JSON...`);
  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-8b-instant',
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: rawExtractedData }
      ],
      temperature: 0.1,
      max_tokens: 1000
    }, {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
    });

    const content = res.data.choices[0].message.content;
    const cleanContent = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    const data = JSON.parse(cleanContent);
    
    console.log("\n🎯 RESULTADO FINAL (JSON):");
    console.log(JSON.stringify(data.products, null, 2));
    
    const hasImage = data.products.some(p => p.image && p.image.length > 5 && p.image !== 'null');
    console.log(`\n📷 Verificação de Imagem: ${hasImage ? 'APROVADO (Imagens encontradas!)' : 'FALHOU (Sem imagens válidas)'}`);

  } catch (err) {
    console.error(`❌ Erro Groq: ${err.message}`);
  }
}

testExtract('https://www.amazon.com.br/s?k=Fralda', 'Amazon').then(() => {
  console.log("🏁 Teste Concluído.");
  process.exit(0);
});
