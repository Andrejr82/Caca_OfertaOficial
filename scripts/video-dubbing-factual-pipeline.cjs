const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

const GROQ_MAX_COMPLETION_TOKENS = 2048;

const execFileAsync = promisify(execFile);

const HOOKS = [
  'Olha esse achado!',
  'Dá uma olhada nisso!',
  'Encontramos essa opção!',
];

const CTAS = [
  'Gostou? Corre pra conferir esse achado!',
  'Curtiu? Corre pra conferir!',
  'Vale a pena dar uma olhada. Corre pra conferir!',
];

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function normalizeForMatch(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parsePrice(value) {
  if (typeof value === 'number') return value;
  const raw = cleanText(value).replace(/R\$\s*/iu, '');
  const normalized = raw.includes(',') ? raw.replace(/\./gu, '').replace(',', '.') : raw;
  return Number(normalized);
}

function buildTrustedInput({ title, price, marketplace, durationSecs }) {
  const trusted = {
    title: cleanText(title),
    price: parsePrice(price),
    marketplace: cleanText(marketplace),
    durationSecs: Number(durationSecs),
  };

  if (!trusted.title) throw new Error('ENTRADA_INVALIDA: título obrigatório.');
  if (!Number.isFinite(trusted.price) || trusted.price <= 0) throw new Error('ENTRADA_INVALIDA: preço confiável obrigatório.');
  if (!trusted.marketplace) throw new Error('ENTRADA_INVALIDA: marketplace obrigatório.');
  if (!Number.isFinite(trusted.durationSecs) || trusted.durationSecs <= 0) throw new Error('ENTRADA_INVALIDA: duração do vídeo obrigatória.');
  return Object.freeze(trusted);
}

function sourceContains(source, fact) {
  const normalizedSource = ` ${normalizeForMatch(source)} `;
  const normalizedFact = normalizeForMatch(fact);
  return Boolean(normalizedFact && normalizedSource.includes(` ${normalizedFact} `));
}

function uniqueFacts(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean))];
}

function validateExtraction(input, rawExtraction) {
  if (!rawExtraction || typeof rawExtraction !== 'object') throw new Error('EXTRACAO_INVALIDA: objeto obrigatório.');
  const extraction = {
    product: cleanText(rawExtraction.product),
    attributes: uniqueFacts(rawExtraction.attributes),
    quantities: uniqueFacts(rawExtraction.quantities),
    measures: uniqueFacts(rawExtraction.measures),
    brand: rawExtraction.brand ? cleanText(rawExtraction.brand) : null,
  };

  if (!extraction.product) throw new Error('EXTRACAO_INVALIDA: produto principal obrigatório.');
  const facts = [
    extraction.product,
    ...extraction.attributes,
    ...extraction.quantities,
    ...extraction.measures,
    ...(extraction.brand ? [extraction.brand] : []),
  ];

  for (const fact of facts) {
    if (!sourceContains(input.title, fact)) throw new Error(`FATO_NAO_COMPROVADO: ${fact}`);
  }
  return Object.freeze({
    ...extraction,
    attributes: Object.freeze(extraction.attributes),
    quantities: Object.freeze(extraction.quantities),
    measures: Object.freeze(extraction.measures),
  });
}

function validateSelection(extraction, rawSelection, { allowEmpty = true } = {}) {
  if (!rawSelection || typeof rawSelection !== 'object') throw new Error('SELECAO_INVALIDA: objeto obrigatório.');
  const selectedAttributes = uniqueFacts(rawSelection.selectedAttributes).slice(0, 3);
  const allowed = new Map(extraction.attributes.map((fact) => [normalizeForMatch(fact), fact]));
  for (const fact of selectedAttributes) {
    if (!allowed.has(normalizeForMatch(fact))) throw new Error(`SELECAO_NAO_CERTIFICADA: ${fact}`);
  }
  if (!allowEmpty && selectedAttributes.length === 0) throw new Error('SELECAO_INVALIDA: ao menos um atributo obrigatório.');

  const hookId = Number(rawSelection.hookId);
  const ctaId = Number(rawSelection.ctaId);
  if (!Number.isInteger(hookId) || !HOOKS[hookId]) throw new Error('SELECAO_INVALIDA: hookId fora da lista permitida.');
  if (!Number.isInteger(ctaId) || !CTAS[ctaId]) throw new Error('SELECAO_INVALIDA: ctaId fora da lista permitida.');

  return {
    selectedAttributes: selectedAttributes.map((fact) => allowed.get(normalizeForMatch(fact))),
    hookId,
    ctaId,
  };
}

function integerToPortuguese(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 10000) return String(value);
  const units = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  if (number < 10) return units[number];
  if (number < 20) return teens[number - 10];
  if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` e ${units[number % 10]}` : ''}`;
  if (number === 100) return 'cem';
  if (number < 1000) return `${hundreds[Math.floor(number / 100)]}${number % 100 ? ` e ${integerToPortuguese(number % 100)}` : ''}`;
  if (number === 1000) return 'mil';
  if (number < 10000) return `${integerToPortuguese(Math.floor(number / 1000))} mil${number % 1000 ? ` e ${integerToPortuguese(number % 1000)}` : ''}`;
  return 'dez mil';
}

function spokenPrice(price) {
  const numeric = Number(price);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('PRECO_INVALIDO');
  const centsTotal = Math.round(numeric * 100);
  const reais = Math.floor(centsTotal / 100);
  const cents = centsTotal % 100;
  return `${integerToPortuguese(reais)} ${reais === 1 ? 'real' : 'reais'}${cents ? ` e ${integerToPortuguese(cents)} centavos` : ''}`;
}

function capitalize(value) {
  const text = cleanText(value);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function composeCertifiedCopy(input, extraction, rawSelection) {
  const selection = validateSelection(extraction, rawSelection);
  const selectedAttributes = selection.selectedAttributes.filter((fact) => !sourceContains(extraction.product, fact));
  const attributes = selectedAttributes.length ? ` ${selectedAttributes.join(', ')}` : '';
  return `${HOOKS[selection.hookId]} ${capitalize(extraction.product)}${attributes} por ${spokenPrice(input.price)} na ${input.marketplace}. ${CTAS[selection.ctaId]}`;
}

function removePhrase(text, phrase) {
  const normalizedPhrase = normalizeForMatch(phrase);
  if (!normalizedPhrase) return text;
  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return text.replace(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'gu'), ' ');
}

function certifyCopy(input, extraction, copy) {
  const text = cleanText(copy);
  if (!text) return { ok: false, reason: 'COPY_VAZIA' };
  const hook = HOOKS.find((candidate) => text.startsWith(candidate));
  const cta = CTAS.find((candidate) => text.endsWith(candidate));
  if (!hook) return { ok: false, reason: 'GANCHO_NAO_AUTORIZADO' };
  if (!cta) return { ok: false, reason: 'CTA_NAO_AUTORIZADO' };
  if (!sourceContains(text, extraction.product)) return { ok: false, reason: 'IDENTIDADE_AUSENTE' };
  if (!sourceContains(text, input.marketplace)) return { ok: false, reason: 'MARKETPLACE_DIVERGENTE' };
  if (!normalizeForMatch(text).includes(normalizeForMatch(spokenPrice(input.price)))) return { ok: false, reason: 'PRECO_DIVERGENTE' };

  let residue = ` ${normalizeForMatch(text)} `;
  const removable = [
    hook,
    cta,
    extraction.product,
    input.marketplace,
    spokenPrice(input.price),
    ...extraction.attributes,
    ...extraction.quantities,
    ...extraction.measures,
    ...(extraction.brand ? [extraction.brand] : []),
  ].sort((a, b) => normalizeForMatch(b).length - normalizeForMatch(a).length);
  for (const phrase of removable) residue = removePhrase(residue, phrase);

  const allowedStructure = new Set(['por', 'na', 'no', 'em', 'e', 'com', 'de', 'da', 'do', 'das', 'dos', 'para']);
  const unexpected = normalizeForMatch(residue).split(/\s+/u).filter(Boolean).filter((token) => !allowedStructure.has(token));
  if (unexpected.length) return { ok: false, reason: `FATO_NOVO_NAO_CERTIFICADO: ${unexpected.join(' ')}` };
  return { ok: true };
}

function parseJsonObject(value) {
  const text = String(value ?? '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('IA_ESTRUTURA_INVALIDA: JSON ausente.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('IA_ESTRUTURA_INVALIDA: JSON inválido.');
  }
}

function extractionPrompt(input) {
  return `Extraia fatos LITERAIS do título abaixo. Nunca use sinônimos, inferências, benefícios ou características implícitas. Cada valor textual deve ser um trecho que exista literalmente no título.\n\nTÍTULO: ${input.title}\n\nRetorne somente os campos solicitados. product obrigatório; arrays podem ser vazios; brand somente se a marca estiver explícita no título.`;
}

function selectionPrompt(input, extraction, maxAttributes = 3) {
  return `Selecione a identidade falada mais natural usando SOMENTE os fatos certificados abaixo. Não reescreva fatos e não crie palavras novas.\nProduto: ${extraction.product}\nAtributos permitidos: ${JSON.stringify(extraction.attributes)}\nDuração: ${input.durationSecs}s\n\nEscolha até ${maxAttributes} atributos EXATAMENTE como aparecem na lista. hookId e ctaId devem ser 0, 1 ou 2.`;
}

function reductionPrompt(input, extraction, currentSelection, maxAttributes) {
  return `O áudio ficou longo para ${input.durationSecs}s. Reduza a copy removendo atributos, sem reescrever nenhum fato.\nProduto fixo: ${extraction.product}\nAtributos certificados: ${JSON.stringify(extraction.attributes)}\nAtributos atuais: ${JSON.stringify(currentSelection.selectedAttributes)}\n\nEscolha no máximo ${maxAttributes} atributo(s), sempre EXATAMENTE da lista certificada. Preserve hookId=${currentSelection.hookId} e ctaId=${currentSelection.ctaId}.`;
}

function groqResponseFormat(stage, context) {
  const schema = stage === 'extract'
    ? {
        type: 'object',
        properties: {
          product: { type: 'string' },
          attributes: { type: 'array', items: { type: 'string' } },
          quantities: { type: 'array', items: { type: 'string' } },
          measures: { type: 'array', items: { type: 'string' } },
          brand: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['product', 'attributes', 'quantities', 'measures', 'brand'],
        additionalProperties: false,
      }
    : {
        type: 'object',
        properties: {
          selectedAttributes: {
            type: 'array',
            items: { type: 'string' },
            maxItems: stage === 'reduce' ? context.maxAttributes : 3,
          },
          hookId: { type: 'integer', enum: [0, 1, 2] },
          ctaId: { type: 'integer', enum: [0, 1, 2] },
        },
        required: ['selectedAttributes', 'hookId', 'ctaId'],
        additionalProperties: false,
      };

  return {
    type: 'json_schema',
    json_schema: {
      name: `video_dubbing_${stage}`,
      strict: true,
      schema,
    },
  };
}

function createGroqAiClient({ apiKey = process.env.GROQ_API_KEY, model = 'openai/gpt-oss-120b' } = {}) {
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada.');
  return async (stage, context) => {
    let prompt;
    if (stage === 'extract') prompt = extractionPrompt(context.input);
    else if (stage === 'select') prompt = selectionPrompt(context.input, context.extraction, 3);
    else if (stage === 'reduce') prompt = reductionPrompt(context.input, context.extraction, context.selection, context.maxAttributes);
    else throw new Error(`IA_STAGE_INVALIDO: ${stage}`);

    let response;
    try {
      response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: groqResponseFormat(stage, context),
        temperature: 0,
        max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
      }, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch (error) {
      const provider = error?.response?.data?.error ?? {};
      throw new Error(JSON.stringify({
        status: error?.response?.status ?? null,
        code: provider.code ?? 'GROQ_REQUEST_FAILED',
        message: provider.message ?? 'Falha no provider Groq.',
      }));
    }
    return parseJsonObject(response.data?.choices?.[0]?.message?.content);
  };
}

async function measureWithEdgeTts(copy, options = {}) {
  const edgeTtsBin = options.edgeTtsBin || process.env.EDGE_TTS_BIN || 'edge-tts';
  const ffprobeBin = options.ffprobeBin || process.env.FFPROBE_BIN || 'ffprobe';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dubbing-v2-'));
  const txtPath = path.join(dir, 'copy.txt');
  const audioPath = path.join(dir, 'copy.mp3');
  try {
    fs.writeFileSync(txtPath, copy, 'utf8');
    await execFileAsync(edgeTtsBin, [
      '-f', txtPath,
      '--voice', options.voice || 'pt-BR-FranciscaNeural',
      '--rate', options.rate || '+10%',
      '--pitch', options.pitch || '+10Hz',
      '--write-media', audioPath,
    ]);
    const { stdout } = await execFileAsync(ffprobeBin, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);
    const duration = Number(String(stdout).trim());
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('TTS_MEDICAO_INVALIDA');
    return duration;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

async function runFactualDubbingSimulation(rawInput, dependencies = {}) {
  const input = buildTrustedInput(rawInput);
  const aiClient = dependencies.aiClient || createGroqAiClient(dependencies.groq || {});
  const measureTts = dependencies.measureTts || ((copy) => measureWithEdgeTts(copy, dependencies.tts || {}));

  const rawExtraction = await aiClient('extract', { input });
  const extraction = validateExtraction(input, rawExtraction);

  const rawSelection = await aiClient('select', { input, extraction });
  let selection = validateSelection(extraction, rawSelection);
  let copy = composeCertifiedCopy(input, extraction, selection);
  let certification = certifyCopy(input, extraction, copy);
  if (!certification.ok) throw new Error(`CERTIFICACAO_FALHOU: ${certification.reason}`);

  let audioDuration = await measureTts(copy);
  let adjusted = false;
  let attempts = 1;

  while (audioDuration > input.durationSecs && attempts < 4) {
    adjusted = true;
    const maxAttributes = Math.max(0, selection.selectedAttributes.length - 1);
    const rawReduced = await aiClient('reduce', { input, extraction, selection, maxAttributes });
    const reduced = validateSelection(extraction, rawReduced);
    if (reduced.selectedAttributes.length > maxAttributes) throw new Error('AJUSTE_INVALIDO: IA não reduziu atributos.');
    selection = reduced;
    copy = composeCertifiedCopy(input, extraction, selection);
    certification = certifyCopy(input, extraction, copy);
    if (!certification.ok) throw new Error(`CERTIFICACAO_FALHOU_APOS_AJUSTE: ${certification.reason}`);
    audioDuration = await measureTts(copy);
    attempts += 1;
  }

  if (audioDuration > input.durationSecs) {
    throw new Error(`TTS_FIT_FAILED: ${audioDuration.toFixed(2)}s > ${input.durationSecs.toFixed(2)}s após ${attempts} tentativa(s).`);
  }

  return {
    input,
    extraction,
    selection,
    copy,
    certified: true,
    adjusted,
    audioDuration,
    videoDuration: input.durationSecs,
    attempts,
    audioFits: audioDuration <= input.durationSecs,
  };
}

module.exports = {
  HOOKS,
  CTAS,
  buildTrustedInput,
  validateExtraction,
  validateSelection,
  composeCertifiedCopy,
  certifyCopy,
  createGroqAiClient,
  measureWithEdgeTts,
  runFactualDubbingSimulation,
};
