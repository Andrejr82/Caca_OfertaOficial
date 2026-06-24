const url = 'https://meli.la/2S9eeAc';
fetch(url, { redirect: 'follow' }).then(r => r.text()).then(html => {
  const match = html.match(/<meta[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]+)['"][^>]*>/i);
  console.log('og:image:', match ? match[1] : 'not found');
}).catch(console.error);
