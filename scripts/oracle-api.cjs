const express = require('express');
const { PlaywrightCrawler } = require('crawlee');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = 3002;
const API_KEY = process.env.ORACLE_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Função para chamar o Groq Llama-3 e extrair os dados
async function extractWithGroq(text) {
  if (!GROQ_API_KEY) return null;
  const prompt = `Você é um extrator JSON. Leia o texto abaixo (extraído de um site de e-commerce) e extraia:
1. title: O nome do produto
2. price: O preço atual (apenas o número, ex: 159.90, sem R$)
3. image: A URL da imagem principal do produto (se encontrar)

Retorne APENAS um JSON válido, sem markdown. Se não encontrar o preço, mande null.
{"title": "Nome", "price": 10.00, "image": "http..."}

Texto extraído do site:
${text.slice(0, 8000)}`;

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    }, {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
    });

    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  } catch (err) {
    console.error("Erro no Groq:", err.message);
    return null;
  }
}

app.post('/api/scrape', async (req, res) => {
  const { url, token } = req.body;

  if (token !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }

  if (!url) {
    return res.status(400).json({ error: 'Missing url param' });
  }

  console.log(`[API] Recebido pedido para raspar: ${url}`);
  let htmlResult = '';
  let textResult = '';
  let metaResult = {};

  try {
    const crawler = new PlaywrightCrawler({
      maxConcurrency: 1,
      requestHandlerTimeoutSecs: 30,
      launchContext: {
        launchOptions: {
          headless: true,
          args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--single-process']
        }
      },
      async requestHandler({ page }) {
        await page.waitForTimeout(3000);
        htmlResult = await page.evaluate(() => document.documentElement.outerHTML);
        textResult = await page.evaluate(() => document.body.innerText);
        try {
          metaResult.title = await page.title();
          metaResult.ogImage = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content);
        } catch(e) {}
      }
    });

    await crawler.run([url]);

    if (!htmlResult) {
      throw new Error("Falha ao raspar a página.");
    }
    console.log(`[API] Raspagem concluída. Acionando a IA para extratação...`);

    const extracted = await extractWithGroq(textResult) || {};

    console.log(`[API] Extraído com sucesso. Preço: ${extracted.price}`);

    return res.json({
      success: true,
      data: {
        html: htmlResult,
        text: textResult,
        extract: {
          title: extracted.title || null,
          price: extracted.price || null,
          image: extracted.image || null
        },
        metadata: metaResult
      }
    });

  } catch (err) {
    console.error("[API] Erro na raspagem:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Micro-API Oracle rodando firme e forte na porta ${PORT}`);
});
