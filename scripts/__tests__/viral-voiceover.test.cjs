const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanProductNameForVoiceover,
  normalizeTextForTTS,
  estimateVoiceoverDurationSeconds,
  buildViralVoiceoverScript,
  DEFAULT_CTA,
} = require('../viral-voiceover.cjs');

test('cleanProductNameForVoiceover remove ruídos técnicos de marketplace', () => {
  const dirty = 'Lava e Seca Midea 11Kg 110V Bivolt - Shopee Brasil';
  const clean = cleanProductNameForVoiceover(dirty);
  assert.equal(clean, 'Lava e Seca Midea 11Kg');
});

test('normalizeTextForTTS converte marcas e termos para pronúncia brasileira natural', () => {
  const raw = 'Compre sua Air Fryer Midea na Shopee com Bluetooth e Wi-Fi';
  const spoken = normalizeTextForTTS(raw);
  assert.ok(spoken.includes('ér fráier'), 'pronúncia de air fryer');
  assert.ok(spoken.includes('Midêa'), 'pronúncia de midea');
  assert.ok(spoken.includes('Chopí'), 'pronúncia de shopee');
  assert.ok(spoken.includes('blutúfe'), 'pronúncia de bluetooth');
  assert.ok(spoken.includes('uai fai'), 'pronúncia de wifi');
});

test('estimateVoiceoverDurationSeconds calcula tempo proporcional para 8 a 10s', () => {
  const script = 'Se você ainda sofre com roupa que não seca na chuva e fica com cheiro ruim... essa Lava e Seca resolveu tudo! Sai quentinha e pronta pra guardar. Acesse o link na bio!';
  const seconds = estimateVoiceoverDurationSeconds(script);
  assert.ok(seconds >= 7.0 && seconds <= 10.5, `Duração fora da faixa: ${seconds}s`);
});

test('buildViralVoiceoverScript gera roteiro com dor e alívio para Lava e Seca', () => {
  const result = buildViralVoiceoverScript({ product_name: 'Lava e Seca Midea HealthGuard 11kg' });
  assert.ok(result.script.includes('não seca na chuva'), 'deve conter gancho de dor da chuva');
  assert.ok(result.script.includes('Lava e Seca Midea'), 'deve citar o produto encurtado');
  assert.ok(result.script.endsWith(DEFAULT_CTA), 'deve terminar com o CTA padrão na bio');
  assert.ok(result.wordCount >= 20 && result.wordCount <= 35, `Palavras: ${result.wordCount}`);
});

test('buildViralVoiceoverScript gera roteiro para Air Fryer sem óleo', () => {
  const result = buildViralVoiceoverScript({ product_name: 'Fritadeira Elétrica Air Fryer Philco 4L' });
  assert.ok(result.script.includes('fumaça e sujeira de óleo'), 'deve conter dor do óleo');
  assert.ok(result.script.includes('crocante e sequinho'), 'deve conter alívio da crocância');
  assert.ok(result.script.endsWith(DEFAULT_CTA), 'deve terminar com CTA na bio');
});

test('buildViralVoiceoverScript gera roteiro para Robô Aspirador', () => {
  const result = buildViralVoiceoverScript({ product_name: 'Robô Aspirador de Pó Inteligente WAP' });
  assert.ok(result.script.includes('varrendo poeira e pelo de pet'), 'deve conter dor da poeira/pet');
  assert.ok(result.script.includes('limpa os cantinhos sozinho'), 'deve conter benefício autônomo');
  assert.ok(result.script.endsWith(DEFAULT_CTA), 'deve terminar com CTA na bio');
});

test('buildViralVoiceoverScript gera roteiro para Parafusadeira/Ferramenta', () => {
  const result = buildViralVoiceoverScript({ product_name: 'Parafusadeira e Furadeira de Impacto 12V Bivolt' });
  assert.ok(result.script.includes('chave de mão e cansar o braço'), 'deve conter dor do esforço manual');
  assert.ok(result.script.includes('em segundos sem esforço'), 'deve conter alívio de velocidade');
  assert.ok(result.script.endsWith(DEFAULT_CTA), 'deve terminar com CTA na bio');
});

test('buildViralVoiceoverScript gera roteiro para Fone Bluetooth', () => {
  const result = buildViralVoiceoverScript({ product_name: 'Fone de Ouvido Bluetooth Sem Fio TWS' });
  assert.ok(result.script.includes('Fio embolando e fone caindo'), 'deve conter dor do fio/queda');
  assert.ok(result.script.includes('bateria dura o dia todo'), 'deve conter alívio da bateria');
  assert.ok(result.script.endsWith(DEFAULT_CTA), 'deve terminar com CTA na bio');
});

test('buildViralVoiceoverScript gera fallback inteligente para produto genérico', () => {
  const result = buildViralVoiceoverScript(
    { product_name: 'Suporte Articulado para TV 32 a 65 Polegadas' },
    'problema_solucao'
  );
  assert.ok(result.script.includes('Se você ainda se estressa'), 'deve usar gancho universal');
  assert.ok(result.script.endsWith(DEFAULT_CTA), 'deve terminar com CTA na bio');
});

test('buildViralVoiceoverScript aceita CTA customizado quando fornecido', () => {
  const custom = 'Clique no primeiro comentário!';
  const result = buildViralVoiceoverScript(
    { product_name: 'Lava e Seca Midea' },
    'problema_solucao',
    custom
  );
  assert.ok(result.script.endsWith(custom), 'deve terminar com o CTA customizado');
});
