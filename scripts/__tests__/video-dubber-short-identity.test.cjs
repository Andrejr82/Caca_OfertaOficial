const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFallbackDubbingScript,
  sanitizeDubbingScript,
  normalizeSpeechForTTS,
  fitDubbingScriptToDuration,
} = require('../video-dubber.cjs');

const TORNEIRA_TITLE = 'Torneira Chuveiro Termostático Teclado Piano Compatível Gás E Aquecedor Elétrico';

function assertRichTorneiraIdentity(text) {
  assert.match(text, /torneira/iu);
  assert.match(text, /chuveiro/iu);
  assert.match(text, /termostático/iu);
  assert.match(text, /teclado piano/iu);
}

test('fallback preserva identidade distintiva da torneira em vez da categoria genérica', () => {
  const script = buildFallbackDubbingScript(TORNEIRA_TITLE, 12, 114);

  assertRichTorneiraIdentity(script);
  assert.doesNotMatch(script, /Dá uma olhada nisso! Torneira por cento e quatorze reais/iu);
});

test('sanitização rejeita copy que menciona somente a categoria quando há identidade distintiva', () => {
  const generic = 'Dá uma olhada nisso! Torneira por cento e quatorze reais na Shopee. Curtiu? Corre pra conferir!';
  const sanitized = sanitizeDubbingScript(generic, TORNEIRA_TITLE, 12, 114);

  assert.notEqual(sanitized, generic);
  assertRichTorneiraIdentity(sanitized);
});

test('fitting mantém a mesma identidade distintiva ao cair no fallback curto', async () => {
  const result = await fitDubbingScriptToDuration(
    'roteiro longo que não cabe',
    TORNEIRA_TITLE,
    12,
    async (candidate) => candidate.includes('roteiro longo') ? 20 : 8,
    3,
    114,
  );

  assert.equal(result.attempts, 2);
  assertRichTorneiraIdentity(result.text);
});

test('identidade curta melhora outras categorias sem virar título inteiro', () => {
  const cases = [
    ['Cafeteira Elétrica Digital Programável para Café', /cafeteira elétrica digital programável/iu],
    ['Aspirador Robô Inteligente Mapeamento Laser', /aspirador robô inteligente mapeamento laser/iu],
  ];

  for (const [title, expected] of cases) {
    const script = buildFallbackDubbingScript(title, 12);
    assert.match(script, expected, title);
    assert.ok(script.split(/\s+/u).length <= 35, title);
  }
});

test('normalização TTS preserva a identidade portuguesa escolhida', () => {
  const copy = buildFallbackDubbingScript(TORNEIRA_TITLE, 12, 114);
  const tts = normalizeSpeechForTTS(copy);

  assertRichTorneiraIdentity(tts);
});
