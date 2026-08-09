const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
  buildFallbackDubbingScript,
  sanitizeDubbingScript,
  buildDubbingPrompt,
  generateDubbingCopy,
} = require('../video-dubber.cjs');

const FORBIDDEN = [
  'absurdo', 'mudou minha vida', 'revolucionário', 'vai revolucionar',
  'novo aliado', 'sua nova aliada', 'perfeito', 'incrível', 'você vai amar',
  'corre que pode acabar', 'só hoje', 'últimas unidades', 'preço incrível',
  'preço absurdo', 'não perca', 'imperdível', 'transforma sua vida',
  'transforma sua rotina', 'imagina', 'chega de',
];

const PRODUCTS = [
  ['potes herméticos', '05 Potes de Vidro Hermético Transparente Tampa Bambu Porta Alimentos', ['cinco', 'vidro', 'hermético', 'bambu']],
  ['tênis casual', 'Tênis Casual Masculino Leve para Uso Diário', ['tênis', 'casual']],
  ['kit camisetas', 'Kit 3 Camisetas Básicas de Algodão Manga Curta', ['três', 'camisetas', 'algodão']],
  ['cafeteira', 'Cafeteira Elétrica Compacta 咖啡 750ml', ['cafeteira', 'elétrica']],
  ['parafusadeira', 'Parafusadeira Furadeira 48V impacto 3 funções Sem Fio 2 Baterias Com Maleta', ['48V', 'três', 'funções', 'duas', 'baterias', 'maleta']],
  ['kit ferramentas', 'Kit Ferramentas 129 Peças com Maleta', ['kit', 'ferramentas', '129', 'maleta']],
  ['torneira', 'Torneira Gourmet de Parede com Bica Móvel', ['torneira', 'gourmet', 'bica móvel']],
  ['aspirador', 'Aspirador de Pó Portátil USB sem Fio', ['aspirador', 'portátil', 'USB']],
];

test('fallback gera roteiro factual e CTA para oito categorias', () => {
  for (const [name, title, facts] of PRODUCTS) {
    const script = buildFallbackDubbingScript(title, 15);
    const lower = script.toLowerCase();
    assert.match(script, /Você encontra na Shopee\. Acesse o link na publicação\.$/u, name);
    assert.ok(script.split(/\s+/u).length >= 35 && script.split(/\s+/u).length <= 90, name);
    for (const phrase of FORBIDDEN) assert.equal(lower.includes(phrase), false, `${name}: ${phrase}`);
    for (const fact of facts) assert.match(lower, new RegExp(fact.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'), `${name}: ${fact}`);
  }
});

test('fallback não inventa fatos ausentes no título', () => {
  const script = buildFallbackDubbingScript('Cafeteira Elétrica Compacta', 15).toLowerCase();
  for (const invented of ['duas xícaras', 'inox', 'filtro permanente', '900 watts', 'econômica']) {
    assert.equal(script.includes(invented), false, invented);
  }
});

test('fallback deriva quantidade e mantém concordância do produto', () => {
  const potes = buildFallbackDubbingScript('2 Potes de Vidro com Tampa', 15);
  assert.match(potes.toLowerCase(), /dois potes/u);
  assert.doesNotMatch(potes, /cinco potes/iu);
  assert.doesNotMatch(potes, /este cafeteira|este torneira|este potes/iu);
});

test('sanitização troca saída insegura pelo fallback factual', () => {
  const title = 'Kit Ferramentas 129 Peças com Maleta';
  const unsafe = 'Esse produto é um absurdo e vai revolucionar sua rotina. Você vai amar!';
  const script = sanitizeDubbingScript(unsafe, title, 15);
  assert.notEqual(script, unsafe);
  assert.doesNotMatch(script.toLowerCase(), /absurdo|revolucionar|você vai amar/u);
  assert.match(script, /129|maleta/u);
  assert.match(script, /Acesse o link na publicação\.$/u);
});

test('sanitização rejeita característica específica ausente e repetição do nome', () => {
  const title = 'Cafeteira Elétrica Compacta';
  const unsafe = 'Olha esta cafeteira elétrica com acabamento inox e filtro permanente. Você encontra na Shopee. Acesse o link na publicação.';
  const script = sanitizeDubbingScript(unsafe, title, 15);
  assert.doesNotMatch(script.toLowerCase(), /inox|filtro permanente/u);
  assert.ok((script.toLowerCase().match(/cafeteira/g) || []).length <= 2);
});

test('gerador aplica sanitização ao retorno do provedor antes de entregar o script', async () => {
  const originalPost = axios.post;
  const previousKey = process.env.GROQ_API_KEY;
  axios.post = async () => ({ data: { choices: [{ message: { content: 'Esse produto é um absurdo, com acabamento inox. Você encontra na Shopee. Acesse o link na publicação.' } }] } });
  process.env.GROQ_API_KEY = 'test-only';
  try {
    const script = await generateDubbingCopy('Cafeteira Elétrica Compacta', 'não usar', 15);
    assert.doesNotMatch(script.toLowerCase(), /absurdo|inox/u);
    assert.match(script, /Acesse o link na publicação\.$/u);
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
  }
});

test('prompt define autoridade factual, variedade e CTA sem instruções proibidas', () => {
  const prompt = buildDubbingPrompt('Torneira Gourmet com Bica Móvel', 15, 'FEMININO');
  assert.match(prompt, /Única fonte de fatos/iu);
  assert.match(prompt, /não invente|não crie/iu);
  assert.match(prompt, /45 a 80 palavras/u);
  assert.match(prompt, /CTA final/u);
  for (const phrase of ['isso mudou minha vida', 'corre que pode acabar', 'preço incrível']) {
    assert.equal(prompt.toLowerCase().includes(phrase), false, phrase);
  }
});
