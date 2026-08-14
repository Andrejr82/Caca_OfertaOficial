const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
  buildFallbackDubbingScript,
  sanitizeDubbingScript,
  buildDubbingPrompt,
  buildUniversalDubbingCta,
  generateDubbingCopy,
  normalizeSpeechForTTS,
  fitDubbingScriptToDuration,
} = require('../video-dubber.cjs');

test('CTA da dublagem é universal, variado e independente de canal', () => {
  const cta = buildUniversalDubbingCta('Limpa Estofados 300ml - Spray Zip Shopee Brasil');

  assert.match(cta, /(?:Gostou\? Corre pra conferir esse achado!|Curtiu\? Corre pra conferir!|Vale a pena dar uma olhada\. Corre pra conferir!)/u);
  assert.doesNotMatch(cta, /link na publicação|primeiro comentário|bio|vitrine|Stories|acesse a publicação|confira os detalhes/iu);
});

test('sanitização aceita CTA universal variado sem CTA de canal', () => {
  const title = 'Limpa Estofados 300ml - Spray Zip Shopee Brasil';
  const script = 'Olha esse achado! Limpa Estofados Spray Zip 300ml na Shopee. Gostou? Corre pra conferir esse achado!';

  assert.equal(sanitizeDubbingScript(script, title, 8), script);
  assert.doesNotMatch(script, /link na publicação|primeiro comentário|bio|vitrine|Stories/iu);
});

const FORBIDDEN = [
  'absurdo', 'mudou minha vida', 'revolucionário', 'vai revolucionar',
  'novo aliado', 'sua nova aliada', 'perfeito', 'perfeita', 'incrível', 'você vai amar',
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
    assert.match(script, /Corre pra conferir(?: esse achado)?!$/u, name);
    assert.ok(script.split(/\s+/u).length >= 10 && script.split(/\s+/u).length <= 35, name);
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

test('fallback do limpa estofados preserva identidade e CTA falável', () => {
  const title = 'Limpa Estofados 300ml - Spray Zip Shopee Brasil';
  const script = buildFallbackDubbingScript(title, 8);

  assert.match(script, /Limpa Estofados Spray Zip 300ml/iu);
  assert.match(script, /Corre pra conferir(?: esse achado)?!$/u);
  assert.doesNotMatch(script, /Limpa o título|O título apresenta|este para você|detalhes|acesse a publicação|Acesse a publicação/iu);
  assert.doesNotMatch(script, /Shopee Brasil/iu);
  assert.ok(script.split(/\s+/u).length <= 28);
});

test('fallback falável inclui preço somente quando confiável', () => {
  const withPrice = buildFallbackDubbingScript('Chapinha 3 em 1', 8, 39.9);
  const withoutPrice = buildFallbackDubbingScript('Chapinha 3 em 1', 8, 'não informado');

  assert.match(withPrice, /trinta e nove reais/iu);
  assert.doesNotMatch(withoutPrice, /reais|R\$/iu);
});

test('resposta inválida do provider cai em fallback factual sem texto interno', () => {
  const title = 'Limpa Estofados 300ml - Spray Zip Shopee Brasil';
  const script = sanitizeDubbingScript('resposta inválida do provider', title, 8);

  assert.match(script, /Limpa Estofados Spray Zip 300ml/iu);
  assert.doesNotMatch(script, /provider|prompt|título apresenta|acesse a publicação/iu);
  assert.match(script, /Corre pra conferir(?: esse achado)?!$/u);
});

test('fallback deriva quantidade e mantém concordância do produto', () => {
  const potes = buildFallbackDubbingScript('2 Potes de Vidro com Tampa', 15);
  assert.match(potes.toLowerCase(), /dois potes/u);
  assert.doesNotMatch(potes, /cinco potes/iu);
  assert.doesNotMatch(potes, /este cafeteira|este torneira|este potes/iu);
});

test('identidade preserva preposições naturais do nome do produto', () => {
  const regressions = [
    ['Calça Masculina', /calça/iu],
    ['Limpa Estofados', /limpa estofados/iu],
    ['Chapinha 3 em 1', /chapinha 3 em 1/iu],
    ['Panela de Pressão Elétrica multifuncional', /panela de pressão elétrica multifuncional/iu],
  ];

  for (const [title, identity] of regressions) {
    assert.match(buildFallbackDubbingScript(title, 12), identity, title);
  }
});

test('sanitização troca saída insegura pelo fallback factual', () => {
  const title = 'Kit Ferramentas 129 Peças com Maleta';
  const unsafe = 'Esse produto é um absurdo e vai revolucionar sua rotina. Você vai amar!';
  const script = sanitizeDubbingScript(unsafe, title, 15);
  assert.notEqual(script, unsafe);
  assert.doesNotMatch(script.toLowerCase(), /absurdo|revolucionar|você vai amar/u);
  assert.match(script, /129|maleta/u);
  assert.match(script, /Corre pra conferir(?: esse achado)?!$/u);
});

test('sanitização rejeita característica específica ausente e repetição do nome', () => {
  const title = 'Cafeteira Elétrica Compacta';
  const unsafe = 'Olha esta cafeteira elétrica com acabamento inox e filtro permanente. Você encontra na Shopee. Corre pra conferir!';
  const script = sanitizeDubbingScript(unsafe, title, 15);
  assert.doesNotMatch(script.toLowerCase(), /inox|filtro permanente/u);
  assert.ok((script.toLowerCase().match(/cafeteira/g) || []).length <= 2);
});

test('gerador aplica sanitização ao retorno do provedor antes de entregar o script', async () => {
  const originalPost = axios.post;
  const previousKey = process.env.GROQ_API_KEY;
  axios.post = async () => ({ data: { choices: [{ message: { content: 'Esse produto é um absurdo, com acabamento inox. Você encontra na Shopee. Corre pra conferir!' } }] } });
  process.env.GROQ_API_KEY = 'test-only';
  try {
    const script = await generateDubbingCopy('Cafeteira Elétrica Compacta', 'não usar', 15);
    assert.doesNotMatch(script.toLowerCase(), /absurdo|inox/u);
  assert.match(script, /Corre pra conferir(?: esse achado)?!$/u);
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
  }
});

test('timeout do provider usa fallback factual seguro', async () => {
  const originalPost = axios.post;
  const previousKey = process.env.GROQ_API_KEY;
  axios.post = async () => { throw new Error('timeout'); };
  process.env.GROQ_API_KEY = 'test-only';
  try {
    const script = await generateDubbingCopy('Limpa Estofados 300ml - Spray Zip Shopee Brasil', 'não informado', 8);
    assert.match(script, /Limpa Estofados Spray Zip 300ml/iu);
  assert.match(script, /Corre pra conferir(?: esse achado)?!$/u);
    assert.doesNotMatch(script, /acesse a publicação|título apresenta|detalhes/iu);
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
  assert.match(prompt, /escreva para fala/iu);
  assert.match(prompt, /SKU.*código alfanumérico/iu);
  assert.match(prompt, /números e unidades.*forma natural de fala/iu);
  assert.match(prompt, /não invente pronúncia de marcas/iu);
  for (const phrase of ['isso mudou minha vida', 'corre que pode acabar', 'preço incrível']) {
    assert.equal(prompt.toLowerCase().includes(phrase), false, phrase);
  }
});

test('normalizador converte medidas frequentes para fala natural', () => {
  const input = 'Monitor Gamer 27" com 360° e 48V, 180Hz, 2,4GHz, 512GB, 1TB, 10000mAh e 3 em 1.';
  const output = normalizeSpeechForTTS(input);

  for (const phrase of [
    'vinte e sete polegadas',
    'trezentos e sessenta graus',
    'quarenta e oito volts',
    'cento e oitenta hertz',
    'dois vírgula quatro gigahertz',
    'quinhentos e doze gigabytes',
    'um terabyte',
    'dez mil miliampères-hora',
    'três em um',
  ]) assert.match(output, new RegExp(phrase, 'iu'), phrase);
  assert.doesNotMatch(output, /27["”]|360°|48\s*V|180\s*Hz|2,4\s*GHz|512\s*GB|1\s*TB|10000\s*mAh/u);
});

test('normalizador aplica aliases explícitos para siglas técnicas', () => {
  const output = normalizeSpeechForTTS('SSD USB HDMI RGB QHD FHD');
  assert.equal(output, 'ésse ésse dê u ésse bê agá dê éme í érre gê bê quê agá dê éfe agá dê');
});

test('normalizador remove códigos alfanuméricos não comerciais', () => {
  const output = normalizeSpeechForTTS('Monitor DXMO238F100 HQ27IP18 TGT-HRTC-BL03 com 27".');
  assert.doesNotMatch(output, /DXMO238F100|HQ27IP18|TGT-HRTC-BL03/u);
  assert.match(output, /vinte e sete polegadas/u);
});

test('normalizador transforma separadores técnicos em pausas faláveis', () => {
  const output = normalizeSpeechForTTS('Monitor QHD/USB (RGB) | sem fio');
  assert.doesNotMatch(output, /[\/|()]/u);
  assert.match(output, /quê agá dê e u ésse bê/u);
});

test('copy permanece comercial e normal enquanto TTS recebe texto falável', () => {
  const copy = 'Monitor Gamer 27" QHD 180Hz. Você encontra na Shopee. Corre pra conferir!';
  const ttsText = normalizeSpeechForTTS(copy);

  assert.equal(copy, 'Monitor Gamer 27" QHD 180Hz. Você encontra na Shopee. Corre pra conferir!');
  assert.match(copy, /27"/u);
  assert.match(ttsText, /vinte e sete polegadas/u);
  assert.match(ttsText, /cento e oitenta hertz/u);
  assert.match(ttsText, /Corre pra conferir!$/u);
  assert.doesNotMatch(ttsText, /27"|180Hz/u);
});

test('fallback preserva identidade curta do Mixer com e sem marca', () => {
  const withBrand = 'Mixer 3 Em 1 Power Inox Elgin 1000w MIX3X Triturador Inox Shopee Brasil';
  const withoutBrand = 'Mixer 3 Em 1 Power Inox 1000w MIX3X Triturador Inox';

  for (const title of [withBrand, withoutBrand]) {
    const copy = buildFallbackDubbingScript(title, 15);
    assert.match(copy, /Mixer/iu);
    assert.match(copy, /(?:3 em 1|três em um)/iu);
    assert.match(copy, /Corre pra conferir!$/u);
  }
});

test('sanitização usa fallback quando Mixer não tem identidade mínima', () => {
  const title = 'Mixer 3 Em 1 Power Inox Elgin 1000w MIX3X Triturador Inox Shopee Brasil';
  const unsafe = 'Olha essa opção para a cozinha. Você encontra na Shopee. Acesse o link na publicação.';
  const copy = sanitizeDubbingScript(unsafe, title, 15);

  assert.match(copy, /Mixer/iu);
  assert.match(copy, /(?:3 em 1|três em um)/iu);
  assert.doesNotMatch(copy, /MIX3X|1000w|Shopee Brasil/iu);
});

test('Shopee permanece na copy e vira Chopí somente no TTS', () => {
  const copy = 'Você encontra na Shopee. Corre pra conferir!';
  const ttsText = normalizeSpeechForTTS(copy);

  assert.match(copy, /Shopee/u);
  assert.doesNotMatch(copy, /Chopí/u);
  assert.match(ttsText, /Chopí/u);
  assert.doesNotMatch(ttsText, /Shopee/u);
  assert.match(ttsText, /Corre pra conferir!$/u);
});

test('Air Fryer recebe pronúncia segura somente no texto do TTS', () => {
  const copy = 'Air Fryer, uma ótima opção para a cozinha. Você encontra na Shopee.';
  const ttsText = normalizeSpeechForTTS(copy);

  assert.equal(copy, 'Air Fryer, uma ótima opção para a cozinha. Você encontra na Shopee.');
  assert.match(copy, /Air Fryer/u);
  assert.match(ttsText, /ér fráier/iu);
  assert.match(ttsText, /Chopí/u);
  assert.doesNotMatch(ttsText, /Air Fryer|Shopee/u);
  assert.match(ttsText, /ótima opção para a cozinha/u);
});

test('normalização de pronúncia não altera palavras não relacionadas', () => {
  const text = 'Fritadeira elétrica para preparar alimentos.';
  assert.equal(normalizeSpeechForTTS(text), text);
});

test('fitting de TTS tenta fallbacks determinísticos e retorna o primeiro que cabe', async () => {
  const durations = [20, 10];
  const result = await fitDubbingScriptToDuration(
    'roteiro muito longo para o vídeo',
    'Cafeteira Elétrica Compacta',
    12,
    async () => durations.shift(),
    3,
  );

  assert.equal(result.attempts, 2);
  assert.equal(result.duration, 10);
  assert.match(result.text, /cafeteira/iu);
});

test('fallback fecha quando a identidade do produto é insuficiente', () => {
  assert.throws(
    () => buildFallbackDubbingScript('Produto genérico em promoção', 15),
    /identidade do produto insuficiente/iu,
  );
});

test('fitting fecha quando não há identidade factual para fallback', async () => {
  await assert.rejects(
    () => fitDubbingScriptToDuration('roteiro longo', 'Produto genérico', 12, async () => 20, 3),
    /TTS_FIT_FAILED/iu,
  );
});

test('fitting fecha quando a medição do TTS é inválida', async () => {
  await assert.rejects(
    () => fitDubbingScriptToDuration('roteiro longo', 'Cafeteira Elétrica Compacta', 12, async () => null, 3),
    /TTS_FIT_FAILED/iu,
  );
});
