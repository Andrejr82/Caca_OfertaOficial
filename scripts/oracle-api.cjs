const os = require('os');
os.freemem = () => 4 * 1024 * 1024 * 1024; // 4 GB
os.totalmem = () => 4 * 1024 * 1024 * 1024; // 4 GB
const express = require('express');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

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
Exemplo de Saída: {"title": "Nome", "price": 10.00, "image": "http..."}

Texto extraído do site:
${text.slice(0, 8000)}`;

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-8b-instant', // Usando um modelo mais novo e rápido
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    }, {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      timeout: 10000 // Timeout pro groq não travar a req
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

  const SCRAPFLY_API_KEY = process.env.SCRAPFLY_API_KEY;
  if (!SCRAPFLY_API_KEY) {
    return res.status(500).json({ error: 'SCRAPFLY_API_KEY não configurada na VPS.' });
  }

  try {
    console.log(`[API] Solicitando HTML ao Scrapfly...`);
    const scrapflyUrl = `https://api.scrapfly.io/scrape?key=${SCRAPFLY_API_KEY}&url=${encodeURIComponent(url)}&asp=true&render_js=true&country=br`;
    const response = await axios.get(scrapflyUrl, { timeout: 60000 });
    
    htmlResult = response.data.result.content;
    if (!htmlResult) {
      throw new Error("Falha ao raspar a página. Retorno vazio do Scrapfly.");
    }

    // Parsing do HTML para texto limpo usando Regex se Cheerio falhar, mas vamos tentar Cheerio primeiro se disponível, ou regex.
    // Usando cheerio para limpeza segura do texto
    const cheerio = require('cheerio');
    const $ = cheerio.load(htmlResult);
    $('script, style, noscript, svg, img').remove();
    textResult = $('body').text().replace(/\s+/g, ' ').trim();

    metaResult.title = $('title').text() || '';
    metaResult.ogImage = $('meta[property="og:image"]').attr('content') || '';

    
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
