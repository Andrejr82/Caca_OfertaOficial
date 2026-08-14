const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTrustedInput,
  validateExtraction,
  composeCertifiedCopy,
  certifyCopy,
  runFactualDubbingSimulation,
} = require('../video-dubbing-factual-pipeline.cjs');
const { resolveEdgeTtsBin } = require('../video-dubbing-runtime-paths.cjs');

test('entrada confiável normaliza campos obrigatórios sem inventar dados', () => {
  const input = buildTrustedInput({
    title: 'Mini Teclado Sem Fio Wireless Iluminado LED RGB com Touchpad USB Recarregável para Smart TV Box PC',
    price: 29.9,
    marketplace: 'Amazon',
    durationSecs: 12,
  });

  assert.equal(input.title, 'Mini Teclado Sem Fio Wireless Iluminado LED RGB com Touchpad USB Recarregável para Smart TV Box PC');
  assert.equal(input.price, 29.9);
  assert.equal(input.marketplace, 'Amazon');
  assert.equal(input.durationSecs, 12);
});

test('simulação resolve Edge TTS pelo override, runtime conhecido e PATH', () => {
  assert.equal(resolveEdgeTtsBin({
    env: { EDGE_TTS_BIN: '/custom/edge-tts' },
    platform: 'linux',
    existsSync: () => false,
  }), '/custom/edge-tts');

  assert.equal(resolveEdgeTtsBin({
    env: {},
    platform: 'linux',
    existsSync: (candidate) => candidate === '/home/ubuntu/.local/bin/edge-tts',
  }), '/home/ubuntu/.local/bin/edge-tts');

  assert.equal(resolveEdgeTtsBin({
    env: {},
    platform: 'win32',
    existsSync: (candidate) => candidate.includes('pythoncore-3.14-64'),
  }), 'C:\\Users\\André\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\edge-tts.exe');

  assert.equal(resolveEdgeTtsBin({
    env: {},
    platform: 'darwin',
    existsSync: () => false,
  }), 'edge-tts');
});

test('validação factual rejeita atributo que não existe no título', () => {
  const input = buildTrustedInput({
    title: 'Tênis Masculino Feminino Calce Fácil Sem Cadarço Shopee Brasil',
    price: 29.9,
    marketplace: 'Shopee',
    durationSecs: 12,
  });

  assert.throws(() => validateExtraction(input, {
    product: 'Tênis',
    attributes: ['Calce Fácil', 'Sem Cadarço', 'casual'],
    quantities: [],
    measures: [],
    brand: null,
  }), /FATO_NAO_COMPROVADO: casual/u);
});

test('copy certificada usa somente fatos validados, preço, marketplace e CTA permitido', () => {
  const input = buildTrustedInput({
    title: 'Tênis Masculino Feminino Calce Fácil Sem Cadarço Shopee Brasil',
    price: 29.9,
    marketplace: 'Shopee',
    durationSecs: 12,
  });
  const extraction = validateExtraction(input, {
    product: 'Tênis',
    attributes: ['Calce Fácil', 'Sem Cadarço'],
    quantities: [],
    measures: [],
    brand: null,
  });
  const copy = composeCertifiedCopy(input, extraction, {
    selectedAttributes: ['Calce Fácil', 'Sem Cadarço'],
    hookId: 1,
    ctaId: 1,
  });

  assert.match(copy, /Tênis Calce Fácil, Sem Cadarço/iu);
  assert.match(copy, /vinte e nove reais e noventa centavos/iu);
  assert.match(copy, /Shopee/iu);
  assert.doesNotMatch(copy, /casual|confortável|leve/iu);
  assert.equal(certifyCopy(input, extraction, copy).ok, true);
});

test('simulação executa IA -> validação -> seleção -> copy -> TTS -> ajuste -> certificação', async () => {
  const aiCalls = [];
  const fakeAi = async (stage) => {
    aiCalls.push(stage);
    if (stage === 'extract') return {
      product: 'Tênis',
      attributes: ['Masculino', 'Feminino', 'Calce Fácil', 'Sem Cadarço'],
      quantities: [],
      measures: [],
      brand: null,
    };
    if (stage === 'select') return {
      selectedAttributes: ['Calce Fácil', 'Sem Cadarço'],
      hookId: 1,
      ctaId: 1,
    };
    if (stage === 'reduce') return {
      selectedAttributes: ['Sem Cadarço'],
      hookId: 1,
      ctaId: 1,
    };
    throw new Error(`stage inesperado: ${stage}`);
  };

  let measures = 0;
  const fakeTts = async () => {
    measures += 1;
    return measures === 1 ? 13.1 : 10.8;
  };

  const result = await runFactualDubbingSimulation({
    title: 'Tênis Masculino Feminino Calce Fácil Sem Cadarço Shopee Brasil',
    price: 29.9,
    marketplace: 'Shopee',
    durationSecs: 12,
  }, { aiClient: fakeAi, measureTts: fakeTts });

  assert.deepEqual(aiCalls, ['extract', 'select', 'reduce']);
  assert.equal(result.certified, true);
  assert.equal(result.adjusted, true);
  assert.equal(result.audioDuration, 10.8);
  assert.doesNotMatch(result.copy, /casual/iu);
  assert.match(result.copy, /Sem Cadarço/iu);
});
