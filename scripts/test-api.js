const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://localhost:3002/api/scrape', {
      url: 'https://www.mercadolivre.com.br/apple-iphone-15-128-gb-preto/p/MLB28507542',
      token: 'oracle-sec-v2-inhouse-2026'
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
test();
