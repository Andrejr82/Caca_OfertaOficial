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

const AMAZON_DEALS_URL = 'https://www.amazon.com.br/deals';

async function fetchViaProxy(url) {
  console.log(`[Amazon] Buscando direto sem Proxy: ${url}`);
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

function parseAmazonDeals(html) {
  const $ = cheerio.load(html);
  const products = [];
  
  // A página de Deals da Amazon usa classes dinâmicas, mas geralmente podemos achar pelas grids de promo
  // O container padrão de deals costuma ser div[data-testid="deal-card"] ou similar.
  // Vamos buscar por vários seletores comuns:
  
  const dealCards = $('div[data-testid="deal-card"], div.DealGridItem-module__dealItem_1kM8h, div[data-deal-id]');
  
  dealCards.each((i, el) => {
    const card = $(el);
    const title = card.find('div[class*="dealTitle"], span.a-truncate-cut, div[class*="a-truncate"]').text().trim();
    const url = card.find('a').attr('href');
    const img = card.find('img').attr('src');
    
    // Tentar achar os preços. A Amazon muda as classes, vamos procurar as mais comuns
    let currentPriceStr = card.find('span.a-price-whole').first().text().replace('.', '') + ',' + card.find('span.a-price-fraction').first().text();
    if (currentPriceStr === ',') {
      currentPriceStr = card.find('span[class*="a-price"]').first().text().match(/R\$\s*([\d.,]+)/)?.[1] || '';
    }
    
    // Preço anterior (riscado)
    let oldPriceStr = card.find('span.a-text-price span.a-offscreen').text().match(/R\$\s*([\d.,]+)/)?.[1] || '';
    if (!oldPriceStr) {
      oldPriceStr = card.find('span[data-a-strike="true"]').text().match(/R\$\s*([\d.,]+)/)?.[1] || '';
    }
    
    if (title && url) {
      products.push({
        title,
        url: url.startsWith('http') ? url : `https://www.amazon.com.br${url}`,
        img,
        currentPrice: currentPriceStr ? Number(currentPriceStr.replace(',', '.')) : null,
        oldPrice: oldPriceStr ? Number(oldPriceStr.replace(',', '.')) : null,
        discount: card.find('.Badge-module__badge_2B2N0, div[class*="Badge"]').text().trim() || null
      });
    }
  });
  
  return products;
}

async function testAmazon() {
  try {
    const html = await fetchViaProxy(AMAZON_DEALS_URL);
    fs.writeFileSync('C:\\Users\\André\\.gemini\\antigravity-ide\\brain\\84c5600f-e2c7-416c-a5fa-5b464bf56d98\\scratch\\amazon_dump.html', html);
    
    console.log('[Amazon] Página baixada com sucesso (Tamanho: ' + html.length + ' bytes)');
    
    if (/Robot Check|Digite os caracteres/i.test(html)) {
      console.log('[Amazon] ALERTA: Scrapedo caiu no Captcha (Robot Check)!');
      return;
    }
    
    const deals = parseAmazonDeals(html);
    console.log(`[Amazon] Parser encontrou ${deals.length} ofertas (deals).`);
    
    if (deals.length > 0) {
      console.log('[Amazon] Amostra do Parser Deals:');
      console.log(deals[0]);
    } else {
      console.log('[Amazon] Nenhum deal encontrado. A estrutura HTML provavelmente mudou ou o seletor está incorreto.');
    }
    
  } catch (err) {
    console.error('[Amazon] Erro durante o teste:', err);
  }
}

testAmazon();
