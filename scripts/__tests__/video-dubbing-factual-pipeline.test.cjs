const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
  buildTrustedInput,
  validateExtraction,
  composeCertifiedCopy,
  certifyCopy,
  createGroqAiClient,
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

test('copy não repete atributo já contido na identidade extraída', () => {
  const input = buildTrustedInput({
    title: 'Tênis Masculino Feminino Calce Fácil Sem Cadarço Shopee Brasil',
    price: 29.9,
    marketplace: 'Shopee',
    durationSecs: 12,
  });
  const extraction = validateExtraction(input, {
    product: 'Tênis Masculino Feminino',
    attributes: ['Masculino', 'Feminino', 'Calce Fácil', 'Sem Cadarço'],
    quantities: [],
    measures: [],
    brand: null,
  });
  const copy = composeCertifiedCopy(input, extraction, {
    selectedAttributes: ['Masculino', 'Feminino', 'Calce Fácil'],
    hookId: 0,
    ctaId: 1,
  });

  assert.equal(copy, 'Olha esse achado! Tênis Masculino Feminino Calce Fácil por vinte e nove reais e noventa centavos na Shopee. Curtiu? Corre pra conferir!');
  assert.doesNotMatch(copy, /Masculino Feminino Masculino/iu);
  assert.equal(certifyCopy(input, extraction, copy).ok, true);
});

test('certificação remove fatos sobrepostos do maior para o menor', () => {
  const input = buildTrustedInput({
    title: 'Tênis Shopee Brasil',
    price: 29.9,
    marketplace: 'Shopee',
    durationSecs: 12,
  });
  const extraction = validateExtraction(input, {
    product: 'Tênis',
    attributes: ['Shopee Brasil'],
    quantities: [],
    measures: [],
    brand: null,
  });
  const copy = composeCertifiedCopy(input, extraction, {
    selectedAttributes: ['Shopee Brasil'],
    hookId: 0,
    ctaId: 0,
  });

  assert.equal(certifyCopy(input, extraction, copy).ok, true);
});

test('Groq usa JSON Schema estrito para extração', async () => {
  const originalPost = axios.post;
  let payload;
  axios.post = async (_url, body) => {
    payload = body;
    return {
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              product: 'Tênis',
              attributes: ['Calce Fácil', 'Sem Cadarço'],
              quantities: [],
              measures: [],
              brand: null,
            }),
          },
        }],
      },
    };
  };

  try {
    const client = createGroqAiClient({ apiKey: 'test-key' });
    const result = await client('extract', {
      input: buildTrustedInput({
        title: 'Tênis Calce Fácil Sem Cadarço',
        price: 29.9,
        marketplace: 'Shopee',
        durationSecs: 12,
      }),
    });

    assert.equal(payload.response_format.type, 'json_schema');
    assert.equal(payload.response_format.json_schema.strict, true);
    assert.equal(payload.response_format.json_schema.schema.additionalProperties, false);
    assert.equal(payload.max_completion_tokens, 2048);
    assert.equal(result.product, 'Tênis');
  } finally {
    axios.post = originalPost;
  }
});

test('Groq propaga somente status, código e mensagem do provider sem segredos', async () => {
  const originalPost = axios.post;
  axios.post = async () => {
    const error = new Error('Request failed with status code 400');
    error.config = { headers: { Authorization: 'Bearer secret-groq-token' } };
    error.response = {
      status: 400,
      data: { error: { code: 'json_validate_failed', message: 'max completion tokens reached before generating a valid document' } },
    };
    throw error;
  };

  try {
    const client = createGroqAiClient({ apiKey: 'secret-groq-token' });
    await assert.rejects(
      () => client('extract', { input: buildTrustedInput({ title: 'Tênis Calce Fácil', price: 29.9, marketplace: 'Shopee', durationSecs: 12 }) }),
      (error) => {
        assert.deepEqual(JSON.parse(error.message), {
          status: 400,
          code: 'json_validate_failed',
          message: 'max completion tokens reached before generating a valid document',
        });
        assert.doesNotMatch(error.message, /secret-groq-token|Authorization|Bearer/i);
        return true;
      },
    );
  } finally {
    axios.post = originalPost;
  }
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
