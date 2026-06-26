const { PlaywrightCrawler } = require('crawlee');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

process.env.CRAWLEE_MEMORY_MBYTES = '400';

async function runGroqTest() {
    console.log('🚀 Iniciando Teste de Raspagem Real (Crawlee + Groq)...');
    
    let rawText = '';

    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        launchContext: {
            launchOptions: {
                headless: true,
                args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--single-process']
            }
        },
        async requestHandler({ request, page, log }) {
            log.info(`Acessando a página: ${request.url}...`);
            await page.waitForTimeout(6000); // Aguarda renderização

            log.info('Extraindo todo o texto visível da página...');
            // Extrai o texto limpo, sem scripts ou CSS
            rawText = await page.evaluate(() => {
                return document.body.innerText;
            });
            
            log.info(`✅ Texto extraído! Tamanho original: ${rawText.length} caracteres.`);
            // Corta para não estourar o limite de tokens do modelo 8B da Groq
            rawText = rawText.substring(0, 10000);
        }
    });

    const testUrl = 'https://www.amazon.com.br/s?k=fralda+pampers';
    await crawler.addRequests([testUrl]);
    await crawler.run();

    if (!rawText) {
        console.log('Erro: Nenhum texto foi extraído da página.');
        return;
    }

    console.log('🧠 Enviando texto para a Groq analisar...');
    try {
        const groqResponse = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.1-8b-instant',
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: 'system',
                        content: `Você é um extrator de dados. Seu objetivo é analisar o texto bruto de um e-commerce e extrair exatamente 2 produtos em destaque.
Responda APENAS com um JSON válido neste formato:
{
  "products": [
    {
      "name": "Nome Completo do Produto",
      "price": "129.90",
      "store": "Mercado Livre"
    }
  ]
}`
                    },
                    {
                        role: 'user',
                        content: `Extraia 2 ofertas deste texto da Amazon:\n\n${rawText}`
                    }
                ],
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const extractedJson = JSON.parse(groqResponse.data.choices[0].message.content);
        console.log('\n--- 🎉 SUCESSO! DADOS ESTRUTURADOS PELA GROQ ---');
        console.log(JSON.stringify(extractedJson, null, 2));
        console.log('-------------------------------------------------\n');
    } catch (error) {
        console.log('❌ Erro na API da Groq:', error.message);
        if (error.response) {
             console.log(error.response.data);
        }
    }
}

runGroqTest().catch(console.error);
