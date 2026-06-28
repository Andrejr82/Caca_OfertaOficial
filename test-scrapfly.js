const axios = require('axios');

async function test() {
  try {
    const r = await axios.get('https://api.scrapfly.io/scrape?key=scp-live-3715f533500f40ae8478266bc835bdb4&url=https%3A%2F%2Fwww.magazineluiza.com.br%2Fbusca%2Fiphone%2520oferta%2520do%2520dia%2F&asp=true&render_js=true&country=br');
    console.log('OK, content length:', r.data.result.content.length);
  } catch(e) {
    console.error('ERR', e.response ? e.response.status : e.message);
  }
}
test();
