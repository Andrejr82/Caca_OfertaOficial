const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseVisualAnalysis,
  buildVisualAnalysisRequest,
  buildVisualAwareScript,
  extractRepresentativeFrames,
  readKimiEnvFile,
  readKimiConfig,
} = require('../kimi-visual-probe.cjs');

test('extrai no máximo cinco frames representativos', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-test-'));
  try {
    const result = await extractRepresentativeFrames('video.mp4', {
      outputDir,
      execFileImpl: async (command, args) => {
        if (command === 'ffprobe') return { stdout: '12\n' };
        fs.writeFileSync(args.at(-1), Buffer.from('jpeg-test'));
        return { stdout: '' };
      },
    });
    assert.equal(result.frames.length, 5);
    assert.deepEqual(result.frames.map((frame) => frame.label), ['0%', '25%', '50%', '75%', '98%']);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('aceita somente JSON visual estruturado e ignora markdown externo', () => {
  const result = parseVisualAnalysis('```json\n{"product_visible":true,"product_type":"calça","visible_attributes":["bolso"],"scenes":[{"frame":"25%","description":"peça de frente","useful":true}],"uncertain_observations":[]}\n```');
  assert.deepEqual(result, {
    product_visible: true,
    product_type: 'calça',
    visible_attributes: ['bolso'],
    scenes: [{ frame: '25%', description: 'peça de frente', useful: true }],
    uncertain_observations: [],
  });
});

test('JSON inválido falha fechado', () => {
  assert.equal(parseVisualAnalysis('não é json'), null);
  assert.equal(parseVisualAnalysis('{"product_visible":"sim"}'), null);
});

test('request usa formato OpenAI multimodal e contexto de identidade', () => {
  const request = buildVisualAnalysisRequest({
    title: 'Calça Pantalona Dunas Feminina Bolso Cintura Alta',
    marketplace: 'Shopee',
    shopId: null,
    itemId: null,
    frames: [{ label: '25%', dataUrl: 'data:image/jpeg;base64,abc' }],
  });

  assert.equal(request.model, 'moonshotai/kimi-k3-free');
  assert.equal(request.messages[0].role, 'user');
  assert.match(request.messages[0].content[0].text, /somente o que é visualmente observável/iu);
  assert.ok(request.messages[0].content.some((part) => part.type === 'image_url'));
});

test('roteiro usa identidade, fatos do título e contexto visual seguro', () => {
  const script = buildVisualAwareScript(
    'Calça Pantalona Dunas Feminina Bolso Cintura Alta Shopee Brasil',
    {
      product_visible: true,
      product_type: 'calça',
      visible_attributes: ['bolso'],
      scenes: [{ frame: '50%', description: 'peça mostrada em movimento', useful: true }],
      uncertain_observations: [],
    }
  );

  assert.match(script, /calça pantalona/iu);
  assert.match(script, /bolso/iu);
  assert.match(script, /movimento|mostrada/iu);
  assert.match(script, /Acesse o link na publicação\.$/u);
  assert.doesNotMatch(script, /revolucion|economiz|confort|perfeit|incrível|absurdo/iu);
});

test('atributo incerto não entra no roteiro', () => {
  const script = buildVisualAwareScript('Aspirador Portátil Sem Fio', {
    product_visible: true,
    product_type: 'aspirador',
    visible_attributes: [],
    scenes: [],
    uncertain_observations: ['parece ter alta potência'],
  });

  assert.doesNotMatch(script, /potência|alta potência/iu);
  assert.match(script, /aspirador/iu);
});

test('configuração Kimi não expõe chave e aceita aliases existentes', () => {
  const config = readKimiConfig({
    'url base': 'https://api.tokenrouter.com/v1',
    'API Key': 'secret-test',
    'Model Id': 'moonshotai/kimi-k3-free',
  });
  assert.deepEqual(config, {
    baseUrl: 'https://api.tokenrouter.com/v1',
    model: 'moonshotai/kimi-k3-free',
    apiKey: 'secret-test',
  });
});

test('leitor aceita arquivo env legado com chaves contendo espaços', () => {
  const env = readKimiEnvFile('url base=https://api.tokenrouter.com/v1\nAPI Key=secret\nModel Id=moonshotai/kimi-k3-free\n');
  assert.deepEqual(env, {
    'url base': 'https://api.tokenrouter.com/v1',
    'API Key': 'secret',
    'Model Id': 'moonshotai/kimi-k3-free',
  });
});
