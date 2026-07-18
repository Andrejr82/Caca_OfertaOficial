const fs = require('fs');
const cheerio = require('cheerio');

// Carregar variáveis de ambiente
const envContent = fs.readFileSync('c:\\Projetos_GitHub\\Caca_OfertaOficial\\.worktrees\\deploy-v53g-main\\.env.local', 'utf-8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  if (!line || line.startsWith('#')) return;
  const idx = line.indexOf('=');
  if (idx !== -1) {
    env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
});

const ML_OFERTAS_URL = 'https://www.mercadolivre.com.br/ofertas';

async function fetchViaProxy(url) {
  console.log(`[ML] Buscando direto sem Proxy: ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      'Accept': 'text/html'
    }
  });
  if (!res.ok) {
    throw new Error(`Fetch direto retornou HTTP ${res.status}`);
  }
  return res.text();
}

function tryParseNordic(html) {
  const marker = '_n.ctx.r=';
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) return null;
  const start = html.indexOf('{', markerAt + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

function tryParseCheerio(html) {
  const $ = cheerio.load(html);
  const products = [];
  
  $('.promotion-item').each((i, el) => {
    const item = $(el);
    const title = item.find('.promotion-item__title').text().trim();
    const url = item.find('a.promotion-item__link-container').attr('href');
    const img = item.find('img').attr('src') || item.find('img').attr('data-src');
    
    // extrair preços
    const oldPriceStr = item.find('.andes-money-amount--previous .andes-money-amount__fraction').text().replace('.', '');
    const currentPriceStr = item.find('.promotion-item__price .andes-money-amount__fraction').text().replace('.', '');
    const centsStr = item.find('.promotion-item__price .andes-money-amount__cents').text();
    
    const oldPrice = oldPriceStr ? Number(oldPriceStr) : null;
    let currentPrice = currentPriceStr ? Number(currentPriceStr) : null;
    if (currentPrice !== null && centsStr) {
      currentPrice += Number(centsStr) / 100;
    }
    
    if (title && url) {
      products.push({
        title,
        url,
        img,
        oldPrice,
        currentPrice,
        discount: item.find('.promotion-item__discount-text').text().trim()
      });
    }
  });
  
  return products;
}

async function testML() {
  try {
    const html = await fetchViaProxy(ML_OFERTAS_URL);
    fs.writeFileSync('C:\\Users\\André\\.gemini\\antigravity-ide\\brain\\84c5600f-e2c7-416c-a5fa-5b464bf56d98\\scratch\\ml_dump.html', html);
    
    console.log('[ML] Página baixada com sucesso (Tamanho: ' + html.length + ' bytes)');
    
    const nordic = tryParseNordic(html);
    if (nordic) {
      const itemsCount = nordic?.appProps?.pageProps?.data?.items?.length || 0;
      console.log(`[ML] Parser Nordic SSR funcionou! Encontrados ${itemsCount} items no estado.`);
    } else {
      console.log('[ML] Parser Nordic SSR falhou (provavelmente mudaram o padrão).');
    }
    
    const cssProducts = tryParseCheerio(html);
    console.log(`[ML] Parser CSS/Cheerio encontrou ${cssProducts.length} produtos visíveis na tela.`);
    if (cssProducts.length > 0) {
      console.log('[ML] Amostra do Parser CSS:');
      console.log(cssProducts[0]);
    }
    
  } catch (err) {
    console.error('[ML] Erro durante o teste:', err);
  }
}

testML();
