const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const {
  analyzeAndAssemble,
  buildVisualSpeechContext,
  buildFinalRenderPlan,
  createJobWorkspace,
  getMediaInfo,
} = require('./video-auto-assembly.cjs');

// Se o edge-tts não estiver no PATH global do sistema, usaremos este atalho validado:
const EDGE_TTS_BIN = 'C:\\Users\\André\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\edge-tts.exe';

// --- ETAPA 0: Classificar gênero do produto ---
async function classifyProductGender(title, apiKey) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'openai/gpt-oss-120b',
        messages: [{
          role: 'user',
          content: `Você é um especialista em gramática portuguesa. Analise o título abaixo e identifique o SUBSTANTIVO PRINCIPAL do produto (a palavra que nomeia o objeto em si, ignorando adjetivos, marcas e especificações técnicas).\nDepois, responda APENAS com uma palavra: MASCULINO ou FEMININO, de acordo com o gênero gramatical desse substantivo principal em português.\nExemplos: "Torneira Elétrica Slim" → substantivo: torneira → FEMININO. "Copo Stanley 900ml" → substantivo: copo → MASCULINO. "Panela de Pressão" → substantivo: panela → FEMININO. "Aspirador Robô" → substantivo: aspirador → MASCULINO.\nTítulo: ${title}`
        }],
        max_completion_tokens: 10,
        temperature: 0,
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    const answer = response.data.choices[0].message.content.trim().toUpperCase();
    return answer.includes('FEMININO') ? 'FEMININO' : 'MASCULINO';
  } catch(e) {
    return 'MASCULINO'; // fallback seguro
  }
}

const FORBIDDEN_DUBBING_PHRASES = [
  'absurdo', 'mudou minha vida', 'revolucionário', 'vai revolucionar',
  'novo aliado', 'sua nova aliada', 'perfeito', 'perfeita', 'incrível', 'você vai amar',
  'corre que pode acabar', 'só hoje', 'últimas unidades', 'preço incrível',
  'preço absurdo', 'não perca', 'imperdível', 'transforma sua vida',
  'transforma sua rotina', 'imagina', 'chega de',
];

const UNSUPPORTED_DUBBING_CLAIMS = [
  /\bmud(a|ou)\s+(?:a\s+)?minha\s+vida\b/iu,
  /\b(?:vai\s+)?revolucion/iu,
  /\beconomiz/iu,
  /\b(?:mais\s+)?tempo\b/iu,
  /\bdur(?:a|abilidade|ável)/iu,
  /\b(?:superior|alta|excelente)\s+qualidade\b/iu,
  /\b(?:confortável|conforto|confort|eficiente|eficiência)\b/iu,
  /\bcompre\b/iu,
  /\b(?:ideal|perfeito|perfeita)\s+para\b/iu,
  /\b(?:para\s+ter|ter\s+um(?:a)?\s+(?:look|resultado|benefício))\b/iu,
  /\b(?:look|visual)\s+(?:moderno|moderna)\b/iu,
];

const SPECIFIC_DUBBING_FACTS = [
  'inox', 'aço', 'algodão', 'vidro', 'bambu', 'usb', 'sem fio', 'bateria',
  'baterias', 'maleta', 'peças', 'funções', 'hermético', 'gourmet', 'compacto',
];

const TRAILING_DUBBING_CONNECTOR = /\s+\b(?:a|ao|aos|as|com|da|das|de|do|dos|e|em|na|nas|no|nos|para|pela|pelas|pelo|pelos|por|sem)\b[.,;:]*$/iu;
const DUBBING_IDENTITY_CONNECTORS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'por', 'sem',
]);
const DUBBING_IDENTITY_NOISE = new Set([
  'masculina', 'masculino', 'feminina', 'feminino', 'unissex', 'adulto', 'adulta',
  'academia', 'corrida', 'fitness', 'treino', 'casual', 'brasil', 'shopee',
  'original', 'premium', 'novo', 'nova', 'kit', 'ou', 'oficial', 'promoção', 'oferta',
]);

function trimTrailingDubbingConnector(value) {
  let output = String(value || '').trim();
  while (TRAILING_DUBBING_CONNECTOR.test(output)) {
    output = output.replace(TRAILING_DUBBING_CONNECTOR, '').trim();
  }
  return output;
}

function normalizeDubbingTitle(title) {
  return String(title || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s*(?:[-|–—]\s*)?Shopee(?:\s+Brasil)?\s*$/iu, '')
    .replace(/\b(?:direct selling|oficial|original|promoção|oferta)\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

const TTS_ACRONYM_ALIASES = new Map([
  ['SSD', 'ésse ésse dê'],
  ['USB', 'u ésse bê'],
  ['HDMI', 'agá dê éme í'],
  ['RGB', 'érre gê bê'],
  ['QHD', 'quê agá dê'],
  ['FHD', 'éfe agá dê'],
]);

const TTS_PRONUNCIATION_ALIASES = new Map([
  ['Shopee', 'Chopí'],
  ['Air Fryer', 'ér fráier'],
]);

function applyTtsPronunciationAliases(text) {
  let output = String(text || '');
  for (const [source, pronunciation] of TTS_PRONUNCIATION_ALIASES) {
    const pattern = source.split(' ').map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('\\s+');
    output = output.replace(new RegExp(`\\b${pattern}\\b`, 'giu'), pronunciation);
  }
  return output;
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

function decimalToPortuguese(value) {
  const [whole, fraction] = String(value).replace('.', ',').split(',');
  if (!fraction) return integerToPortuguese(Number(whole));
  return `${integerToPortuguese(Number(whole))} vírgula ${fraction.split('').map((digit) => integerToPortuguese(Number(digit))).join(' ')}`;
}

function normalizeSpeechForTTS(text) {
  let normalized = String(text || '')
    .replace(/\b(\d{1,3})\s*["”]/gu, (_, value) => `${integerToPortuguese(value)} polegadas`)
    .replace(/\b(\d{1,4})\s*°/gu, (_, value) => `${integerToPortuguese(value)} graus`)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*GHz\b/giu, (_, value) => `${decimalToPortuguese(value)} gigahertz`)
    .replace(/\b(\d{1,6})\s*mAh\b/giu, (_, value) => `${integerToPortuguese(value)} miliampères-hora`)
    .replace(/\b(\d{1,5})\s*GB\b/giu, (_, value) => `${integerToPortuguese(value)} ${Number(value) === 1 ? 'gigabyte' : 'gigabytes'}`)
    .replace(/\b(\d{1,3})\s*TB\b/giu, (_, value) => `${integerToPortuguese(value)} ${Number(value) === 1 ? 'terabyte' : 'terabytes'}`)
    .replace(/\b(\d{1,4})\s*V\b/giu, (_, value) => `${integerToPortuguese(value)} volts`)
    .replace(/\b(\d{1,4})\s*Hz\b/giu, (_, value) => `${integerToPortuguese(value)} hertz`)
    .replace(/\b(\d{1,2})\s+em\s+(\d{1,2})\b/giu, (_, first, second) => `${integerToPortuguese(first)} em ${integerToPortuguese(second)}`);

  for (const [alias, spoken] of TTS_ACRONYM_ALIASES) {
    normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'giu'), spoken);
  }

  normalized = normalized
    .replace(/\b(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g, '')
    .replace(/[\/|]/gu, ' e ')
    .replace(/[()]/gu, '');

  return applyTtsPronunciationAliases(normalized)
    .replace(/\s+/gu, ' ')
    .trim();
}

function numberWord(value, feminine = false) {
  const words = feminine ? { 2: 'duas', 3: 'três', 5: 'cinco' } : { 2: 'dois', 3: 'três', 5: 'cinco' };
  return words[Number(value)] || value;
}

function deriveTitleProductIdentity(normalized) {
  const tokens = normalized.toLowerCase().split(/\s+/u).filter(Boolean);
  const ignored = new Set([
    'masculina', 'masculino', 'feminina', 'feminino', 'unissex', 'adulto', 'adulta',
    'academia', 'corrida', 'fitness', 'treino', 'casual', 'brasil', 'shopee',
    'original', 'premium', 'novo', 'nova', 'kit', 'ou', 'para', 'com', 'sem',
  ]);
  const first = tokens.find((token) => /[a-zá-ú]/iu.test(token) && !/^\d/iu.test(token) && !ignored.has(token));
  if (!first) return null;

  const normalizedFirst = first.replace(/[.,;:]+$/gu, '');
  if (/^(?:produto|genérico|generico)$/iu.test(normalizedFirst)) return null;
  const singular = normalizedFirst.endsWith('s') && normalizedFirst.length > 4
    ? normalizedFirst.slice(0, -1)
    : normalizedFirst;
  const combination = normalized.match(/\b(\d+)\s*em\s*(\d+)\b/iu);
  if (combination) return `${singular} ${combination[1]} em ${combination[2]}`;

  const identityTokens = normalized
    .split(/\s+/u)
    .filter((token) => /[A-Za-zÀ-ÿ]/u.test(token) || /^\d+(?:ml|l|g|kg)$/iu.test(token))
    .filter((token) => !ignored.has(token.toLowerCase()))
    .slice(0, 6);
  const numericToken = identityTokens.find((token) => /^\d+(?:ml|l|g|kg)$/iu.test(token));
  const words = identityTokens.filter((token) => token !== numericToken);
  const identity = [...words.slice(0, 5), numericToken].filter(Boolean).join(' ');
  return trimTrailingDubbingConnector(identity) || singular;
}

function deriveShortSpokenIdentity(normalized, categoryKey, fallbackIdentity) {
  const fallback = trimTrailingDubbingConnector(String(fallbackIdentity || '').replace(/^um |^uma /iu, '').trim());
  const requiredKey = String(categoryKey || '').toLowerCase().trim();
  if (!normalized || !fallback || !requiredKey) return fallback;
  const derivedIdentity = deriveTitleProductIdentity(normalized);
  if (derivedIdentity && derivedIdentity.toLowerCase() === fallback.toLowerCase()) return fallback;

  const selected = [];
  let meaningful = 0;
  for (const rawToken of String(normalized).split(/\s+/u)) {
    const token = rawToken.replace(/^[,.;:()[\]{}]+|[,.;:()[\]{}]+$/gu, '');
    if (!token || !/[A-Za-zÀ-ÿ]/u.test(token)) continue;
    const lower = token.toLowerCase();
    if (DUBBING_IDENTITY_NOISE.has(lower)) continue;
    if (/\d/u.test(token)) {
      if (meaningful < 3) return fallback;
      break;
    }
    if (DUBBING_IDENTITY_CONNECTORS.has(lower)) {
      if (selected.length && meaningful < 5) selected.push(lower);
      continue;
    }
    selected.push(token);
    meaningful += 1;
    if (meaningful >= 5) break;
  }

  const candidate = trimTrailingDubbingConnector(selected.join(' '));
  if (!candidate) return fallback;
  const lowerCandidate = candidate.toLowerCase();
  const keyTerms = requiredKey.split(/\s+/u).filter((term) => !DUBBING_IDENTITY_CONNECTORS.has(term));
  if (!keyTerms.every((term) => lowerCandidate.includes(term))) return fallback;
  return candidate;
}

function identityRequiredTerms(identity) {
  return String(identity || '')
    .toLowerCase()
    .split(/\s+/u)
    .map((term) => term.replace(/^[,.;:]+|[,.;:]+$/gu, ''))
    .filter((term) => term.length >= 2 && !DUBBING_IDENTITY_CONNECTORS.has(term))
    .slice(0, 3);
}

function extractDubbingFacts(title) {
  const normalized = normalizeDubbingTitle(title);
  const lower = normalized.toLowerCase();
  const derivedIdentity = deriveTitleProductIdentity(normalized);
  const category = [
    ['calça', 'uma calça', 'compor looks do dia a dia', 'ter uma peça para diferentes combinações'],
    ['mixer', 'um mixer', 'preparar e triturar alimentos', 'deixar o preparo mais prático'],
    ['air fryer', 'uma Air Fryer', 'preparar alimentos', 'ter um eletrodoméstico para a cozinha'],
    ['potes', 'um conjunto de potes de vidro herméticos', 'organizar e armazenar alimentos', 'deixar os alimentos visíveis e a cozinha mais organizada'],
    ['tênis', 'um tênis casual', 'compor produções do dia a dia', 'combinar com diferentes looks casuais'],
    ['camisetas', 'um kit de camisetas', 'montar opções para o dia a dia', 'ter peças básicas para variar as combinações'],
    ['cafeteira', 'uma cafeteira elétrica', 'preparar café', 'deixar o preparo do café mais simples'],
    ['parafusadeira', 'uma parafusadeira sem fio', 'fazer pequenos reparos e projetos', 'ter o conjunto de ferramentas reunido'],
    ['ferramentas', 'um kit de ferramentas', 'fazer pequenos reparos', 'manter as ferramentas reunidas'],
    ['torneira', 'uma torneira', 'organizar a área da pia', 'ter uma opção funcional para a pia'],
    ['aspirador', 'um aspirador portátil', 'fazer a limpeza do dia a dia', 'alcançar espaços menores com praticidade'],
  ].find(([key]) => lower.includes(key)) || [derivedIdentity || 'produto', `um ${derivedIdentity || 'produto'}`, 'conferir os detalhes apresentados', 'conhecer melhor o produto'];

  let features = [];
  if (/\bmixer\b/iu.test(normalized)) {
    const combination = normalized.match(/\b(\d+)\s+em\s+1\b/iu)?.[0];
    features = [combination, /inox/iu.test(normalized) ? 'inox' : null].filter(Boolean);
  }
  else if (/\bcalça\b|\bpantalona\b/iu.test(normalized)) {
    features = [/pantalona/iu.test(normalized) ? 'pantalona' : null, /bolso/iu.test(normalized) ? 'bolso' : null, /cintura alta/iu.test(normalized) ? 'cintura alta' : null].filter(Boolean);
  }
  else if (/air fryer/iu.test(normalized)) {
    features = [];
  }
  else if (/\bpotes?\b/iu.test(normalized)) {
    const quantityMatch = normalized.match(/\b(\d+)\s+potes?/iu);
    const quantity = quantityMatch ? `${numberWord(quantityMatch[1], false)} ` : '';
    features = [`${quantity}potes de vidro herméticos${/bambu/iu.test(normalized) ? ' com tampa de bambu' : ''}`];
  }
  else if (/\b(?:kit\s+)?\d+\s+camisetas?/iu.test(normalized)) {
    const match = normalized.match(/\bkit\s+(\d+)\s+camisetas?(?:\s+de\s+algodão)?/iu);
    const quantity = match ? numberWord(match[1], true) : null;
    features = [match ? `${quantity} camisetas${/algodão/iu.test(normalized) ? ' de algodão' : ''}` : 'camisetas básicas'];
  }
  else if (/parafusadeira/iu.test(normalized)) {
    const voltage = normalized.match(/\b\d+\s*V\b/iu)?.[0];
    const functions = normalized.match(/\b\d+\s+funções?/iu)?.[0];
    const batteries = normalized.match(/\b\d+\s+baterias?/iu)?.[0];
    const batteryFeature = batteries ? `${numberWord(batteries.match(/\d+/u)[0], true)} baterias${/maleta/iu.test(normalized) ? ' e maleta' : ''}` : (/maleta/iu.test(normalized) ? 'maleta' : null);
    features = [voltage, functions && `${numberWord(functions.match(/\d+/u)[0])} funções`, batteryFeature].filter(Boolean);
  } else if (/kit\s+ferramentas/iu.test(normalized)) {
    const pieces = normalized.match(/\b\d+\s+peças?/iu)?.[0]?.toLowerCase();
    features = [pieces, /maleta/iu.test(normalized) ? 'maleta' : null].filter(Boolean);
  } else {
    const terms = ['casual', 'elétrica', 'compacta', 'gourmet', 'bica móvel', 'portátil', 'USB', 'sem fio', 'impacto', 'algodão'];
    features = terms.filter((term) => new RegExp(`\\b${term.replace(' ', '\\s+')}\\b`, 'iu').test(normalized));
  }

  const categoryName = category[0] === 'mixer'
    ? `${category[1]}${features[0] ? ` ${features[0]}` : ''}`
    : category[1];
  const baseIdentity = categoryName.replace(/^um |^uma /iu, '').trim();
  const identity = deriveShortSpokenIdentity(normalized, category[0], baseIdentity);
  return { key: category[0], category: categoryName, identity, useCase: category[2], benefit: category[3], features: features.slice(0, 3) };
}

function spokenPrice(price) {
  const raw = String(price ?? '').replace(/R\$\s*/iu, '').trim();
  const normalized = raw.includes(',') ? raw.replace(/\./gu, '').replace(',', '.') : raw;
  const numeric = typeof price === 'number' ? price : Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const cents = Math.round(numeric * 100) % 100;
  const reais = Math.floor(numeric);
  return `${integerToPortuguese(reais)} reais${cents ? ` e ${integerToPortuguese(cents)} centavos` : ''}`;
}

function hashText(value) {
  return [...String(value)].reduce((hash, char) => ((hash * 31) + char.codePointAt(0)) >>> 0, 0);
}

function capitalizeSentence(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function buildUniversalDubbingCta(title) {
  const ctas = [
    'Gostou? Corre pra conferir esse achado!',
    'Curtiu? Corre pra conferir!',
    'Vale a pena dar uma olhada. Corre pra conferir!',
  ];
  return ctas[hashText(normalizeDubbingTitle(title)) % ctas.length];
}

function buildFallbackDubbingScript(title, durationSecs = 15, price = null) {
  const facts = extractDubbingFacts(title);
  if (facts.key === 'produto') throw new Error('Identidade do produto insuficiente para gerar roteiro factual.');
  let categoryLabel = (facts.identity || facts.category).replace(/^um |^uma /iu, '').trim();
  if (facts.key === 'potes' && facts.features[0]) categoryLabel = `conjunto de ${facts.features[0]}`;
  if (facts.key === 'camisetas' && facts.features[0]) categoryLabel = `kit de ${facts.features[0]}`;
  categoryLabel = trimTrailingDubbingConnector(categoryLabel.replace(/\bEm\b/gu, 'em'));
  const extraFeatures = facts.features
    .filter((feature) => !categoryLabel.toLowerCase().includes(feature.toLowerCase()))
    .slice(0, 3);
  const normalizedFeatures = extraFeatures.map((feature) => feature.toLowerCase() === 'gourmet' ? 'acabamento gourmet' : feature);
  const adjective = normalizedFeatures.length === 1 && /^(?:compacta|casual|elétrica|portátil|inflável)$/iu.test(normalizedFeatures[0]);
  const featureText = normalizedFeatures.length
    ? adjective ? ` ${normalizedFeatures[0]}` : ` com ${normalizedFeatures.join(' e ')}`
    : '';
  const priceText = spokenPrice(price);
  const hooks = ['Olha esse achado!', 'Dá uma olhada nisso!', 'Encontramos essa opção na Shopee!'];
  const hook = hooks[hashText(normalizeDubbingTitle(title)) % hooks.length];
  const offer = priceText ? ` por ${priceText}` : '';
  const marketplace = /na Shopee[!.]?$/iu.test(hook) ? '' : ' na Shopee';
  return `${hook} ${capitalizeSentence(categoryLabel)}${featureText}${offer}${marketplace}. ${buildUniversalDubbingCta(title)}`;
}

function buildDubbingPrompt(title, durationSecs = 15, gender = 'MASCULINO', visualPlan = null, price = null) {
  const targetWords = Math.round(durationSecs * 3.5);
  const visualContext = visualPlan ? `\nSEQUÊNCIA VISUAL DEFINIDA:\n${buildVisualSpeechContext(visualPlan)}\nA fala deve acompanhar essa sequência e comentar somente o que o título sustenta.` : '';
  return `Você escreve roteiro falado curto, natural e comercial em português do Brasil.

ÚNICA FONTE DE FATOS: use somente informações presentes no título do produto abaixo. Não invente materiais, medidas, desempenho, durabilidade, conforto, economia, qualidade, resultados ou urgência.

TÍTULO DO PRODUTO: ${normalizeDubbingTitle(title)}
DURAÇÃO: ${durationSecs} segundos
PREÇO CONFIÁVEL: ${spokenPrice(price) || 'indisponível; não mencione preço'}
TAMANHO: aproximadamente ${targetWords} palavras, preferencialmente 45 a 80 palavras quando a duração permitir.
CONCORDÂNCIA: use gênero e número naturais, sem forçar pronomes ou adjetivos.

ESTRUTURA:
1. Gancho variado com curiosidade ou utilidade real.
2. Nome curto do produto, sem repetir o título completo.
3. Uma a três características sustentadas pelo título.
4. Um benefício concreto e seguro, sem extrapolar os fatos.
5. CTA final universal, curto, energético e falável. Use uma destas formas: Gostou? Corre pra conferir esse achado!; Curtiu? Corre pra conferir!; Vale a pena dar uma olhada. Corre pra conferir!

IDENTIDADE DO PRODUTO:
- Mencione exatamente uma identificação curta, natural e factual do produto.
- A identificação deve começar pelo tipo ou nome principal do produto.
- Inclua uma característica distintiva curta quando existir e for útil.
- Marca é opcional e nunca substitui o tipo do produto.
- Não use SKU, código, potência ou marketplace como identidade.

REGRAS DE ESTILO:
- Frases curtas, fluidas e naturais para TTS.
- Escreva para fala, não para leitura de catálogo: uma ideia ou especificação por frase.
- Não repita o título completo nem carregue SKU, modelo ou código alfanumérico sem valor comercial.
- Evite slash, pipes, parênteses e blocos técnicos; selecione apenas especificações úteis.
- Expresse números e unidades em forma natural de fala.
- Não invente pronúncia de marcas, não traduza marcas e omita especificação técnica redundante.
- Persuasão por clareza, ritmo e especificidade; sem exagero de propaganda.
- Só mencione o preço confiável fornecido acima; nunca invente preço, desconto, economia ou estoque.
- Não use emojis, aspas, títulos ou numeração.
- Não use urgência falsa, superlativos genéricos ou promessas pessoais.
- Retorne apenas o texto do roteiro.${visualContext}`;
}

function isSafeDubbingScript(script, price = null) {
  const text = String(script || '').trim();
  const lower = text.toLowerCase();
  const expectedPrice = spokenPrice(price);
  const hasPrice = /\b(?:R\$|reais?|centavos?)\b/iu.test(text);
  return text && text.split(/\s+/u).length <= 95
    && !FORBIDDEN_DUBBING_PHRASES.some((phrase) => lower.includes(phrase))
    && !UNSUPPORTED_DUBBING_CLAIMS.some((pattern) => pattern.test(text))
    && !/\b(?:R\$|desconto|estoque|últim|economia|economiz)/iu.test(text)
    && (!hasPrice || Boolean(expectedPrice && text.toLowerCase().includes(expectedPrice.toLowerCase())))
    && !/confira os detalhes|acesse a publicação|acesse o link na publicação|título apresenta|para você conferir/iu.test(text)
    && /(?:Gostou\? Corre pra conferir esse achado!|Curtiu\? Corre pra conferir!|Vale a pena dar uma olhada\. Corre pra conferir!|Corre pra conferir!)$/u.test(text);
}

function hasUnsupportedSpecificFact(script, title) {
  const output = String(script || '').toLowerCase();
  const source = normalizeDubbingTitle(title).toLowerCase();
  return SPECIFIC_DUBBING_FACTS.some((fact) => output.includes(fact) && !source.includes(fact));
}

function hasProductIdentity(script, title) {
  const facts = extractDubbingFacts(title);
  const output = String(script || '').toLowerCase();
  const identity = facts.identity || facts.category || facts.key;
  const requiredTerms = identityRequiredTerms(identity);
  if (requiredTerms.length) return requiredTerms.every((term) => output.includes(term));
  const firstProductWord = normalizeDubbingTitle(title).match(/[A-Za-zÀ-ÿ]{4,}/u)?.[0];
  return Boolean(firstProductWord && output.includes(firstProductWord.toLowerCase()));
}

function repeatsProductName(script, title) {
  const category = extractDubbingFacts(title).category.toLowerCase();
  return category.length > 3 && String(script || '').toLowerCase().split(category).length - 1 > 1;
}

function sanitizeDubbingScript(script, title, durationSecs = 15, price = null) {
  const cleaned = String(script || '')
    .replace(/["“”]/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s+([,.!?])/gu, '$1')
    .trim();
  const safe = isSafeDubbingScript(cleaned, price)
    && hasProductIdentity(cleaned, title)
    && !hasUnsupportedSpecificFact(cleaned, title)
    && !repeatsProductName(cleaned, title);
  return safe ? cleaned : buildFallbackDubbingScript(title, durationSecs, price);
}

function buildTtsFitCandidates(script, title, maxDuration, price = null) {
  const candidates = [String(script || '').trim()];
  try {
    candidates.push(buildFallbackDubbingScript(title, Math.min(Number(maxDuration) || 12, 12), price));
  } catch {
    // Fallback factual indisponível: fitting permanece fechado.
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function fitDubbingScriptToDuration(script, title, maxDuration, measureTtsDuration, maxAttempts = 3, price = null) {
  if (typeof measureTtsDuration !== 'function') throw new TypeError('measureTtsDuration obrigatório.');
  const limit = Math.max(1, Math.floor(Number(maxAttempts) || 3));
  const candidates = buildTtsFitCandidates(script, title, maxDuration, price);
  let lastDuration = null;
  for (let index = 0; index < Math.min(limit, candidates.length); index += 1) {
    const duration = await measureTtsDuration(candidates[index]);
    lastDuration = typeof duration === 'number' ? duration : Number.NaN;
    if (Number.isFinite(lastDuration) && lastDuration > 0 && lastDuration <= Number(maxDuration)) {
      return { text: candidates[index], duration: lastDuration, attempts: index + 1 };
    }
  }
  throw new Error(`TTS_FIT_FAILED: roteiro excede ${Number(maxDuration).toFixed(2)}s após ${Math.min(limit, candidates.length)} tentativas (última duração: ${Number.isFinite(lastDuration) ? lastDuration.toFixed(2) : 'indisponível'}s).`);
}

// --- ETAPA 1: Gerar roteiro persuasivo com gênero correto ---
async function generateDubbingCopy(title, price, durationSecs = 15, gender = 'MASCULINO', visualPlan = null) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada no .env.local');

  const targetWords = Math.round(durationSecs * 3.5);
  const dynamicMaxTokens = Math.max(350, Math.round(targetWords * 2.5) + 100);
  const prompt = buildDubbingPrompt(title, durationSecs, gender, visualPlan, price);

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: dynamicMaxTokens,
        temperature: 0.75,
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    return sanitizeDubbingScript(response.data.choices[0].message.content, title, durationSecs, price);
  } catch {
    return buildFallbackDubbingScript(title, durationSecs, price);
  }
}

// --- ETAPA 2: Gerar TTS com parâmetros de rate e pitch ---
// rate: string como "+10%", "-5%", "+0%" — ajusta velocidade da fala
// pitch: string como "+5Hz" — deixa voz mais animada/entusiasta
function generateTTS(text, outputPath, rate = '+0%', pitch = '+5Hz') {
  return new Promise((resolve, reject) => {
    const tmpTxtFile = outputPath.replace('.mp3', '.txt');
    fs.writeFileSync(tmpTxtFile, text, 'utf8');
    const isWin = process.platform === 'win32';
    
    // Formata rate/pitch para o CLI — valores negativos precisam de = para não serem interpretados como flags
    const rateArg = rate.startsWith('-') ? `--rate=${rate}` : `--rate ${rate}`;
    const pitchArg = pitch.startsWith('-') ? `--pitch=${pitch}` : `--pitch ${pitch}`;

    const cmd = isWin
      ? `cmd /c "${EDGE_TTS_BIN} -f "${tmpTxtFile}" --voice pt-BR-FranciscaNeural ${rateArg} ${pitchArg} --write-media "${outputPath}""`
      : `/home/ubuntu/.local/bin/edge-tts -f "${tmpTxtFile}" --voice pt-BR-FranciscaNeural ${rateArg} ${pitchArg} --write-media "${outputPath}"`;

    exec(cmd, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpTxtFile); } catch(e) {}

      if (error) {
        console.error('Erro no Edge-TTS:', stderr);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
}

async function downloadVideo(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function mergeAudioVideo(videoPath, audioPath, outputPath, finalDuration) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(videoPath)
      .input(audioPath);
    const duration = Number(finalDuration);
    command.outputOptions([
        Number.isFinite(duration) && duration > 0 ? '-t' : null,
        Number.isFinite(duration) && duration > 0 ? String(duration) : null,
        '-map 0:v',
        '-map 1:a',
        '-c:v copy',
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart'
      ].filter(Boolean))
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
  });
}

function getAudioDuration(audioPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err || !metadata || !metadata.format || !metadata.format.duration) {
        return resolve(null);
      }
      resolve(metadata.format.duration);
    });
  });
}

function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err || !metadata || !metadata.format || !metadata.format.duration) {
        return resolve(15); // Fallback seguro
      }
      resolve(Math.floor(metadata.format.duration));
    });
  });
}

/**
 * Calcula o rate% necessário para o áudio durar exatamente o tempo do vídeo.
 * rate > 0 → fala mais rápido (áudio estava longo)
 * rate < 0 → fala mais devagar (áudio estava curto)
 * Limitado entre -30% e +50% para manter qualidade natural da voz.
 */
function calculateRateAdjustment(audioDuration, videoDuration) {
  // rate% = (audioDuration/videoDuration - 1) * 100
  // Ex: áudio=50s, vídeo=40s → rate = +25% (falar mais rápido)
  // NUNCA usamos rate negativo (voz fica cansada/arrastada)
  let rate = (audioDuration / videoDuration - 1) * 100;
  if (rate < 0) rate = 0;         // Não desacelera: preferível terminar um pouco antes
  rate = Math.min(30, rate);      // Máximo +30% para não soar acelerado demais
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${rate.toFixed(0)}%`;
}

/**
 * Processa a dublagem de um vídeo da Shopee
 * @param {string} videoUrl - URL do MP4 extraído pela extensão
 * @param {string} title - Título extraído
 * @param {string} price - Preço extraído
 */
async function processShopeeVideoDubbing(videoUrl, title, price, options = {}) {
  const jobId = options.jobId || crypto.randomUUID();
  const workDir = options.workDir || path.join(__dirname, '..', 'videos_processados');
  const workspace = createJobWorkspace(workDir, jobId);
  fs.mkdirSync(workspace.root, { recursive: true });
  const rawVideoPath = workspace.input;
  const assembledVideoPath = workspace.assembled;
  const audioPath = workspace.audio;
  const finalVideoPath = options.outputPath || workspace.output;

  console.log(`[Job ${jobId}] Iniciando dublagem: ${title}`);

  try {
    // 1. Download
    console.log(`[Job ${jobId}] Baixando vídeo...`);
    await downloadVideo(videoUrl, rawVideoPath);

    // 2. Análise visual e montagem antes da copy.
    console.log(`[Job ${jobId}] Analisando trechos visuais...`);
    const assembly = await analyzeAndAssemble(rawVideoPath, assembledVideoPath, {
      targetDuration: options.targetDuration || 12,
    });
    const durationSecs = assembly.outputQuality.duration;
    console.log(`[Job ${jobId}] Montagem: ${durationSecs.toFixed(2)}s | ${assembly.plan.segments.length} trechos`);

    // 3. Gênero do produto
    const apiKey = process.env.GROQ_API_KEY;
    const gender = await classifyProductGender(title, apiKey);
    console.log(`[Job ${jobId}] Gênero: ${gender}`);

    // 4. Gerar roteiro
    console.log(`[Job ${jobId}] Gerando roteiro...`);
    let copy = await generateDubbingCopy(title, price, durationSecs, gender, assembly.plan);
    console.log(`[Job ${jobId}] Roteiro:\n${copy}`);

    // Reverter "Chopí" antes do TTS e manter copy comercial intacta no retorno.
    copy = copy.replace(/Chopí/gi, 'Shopee');
    let ttsText = normalizeSpeechForTTS(copy);

    // 5. Ajustar texto para TTS sem acelerar a voz.
    const PITCH = '+10Hz';
    console.log(`[Job ${jobId}] Ajustando texto para TTS (pitch: ${PITCH})...`);
    const fit = await fitDubbingScriptToDuration(copy, title, durationSecs, async (candidate) => {
      ttsText = normalizeSpeechForTTS(candidate);
      try { fs.unlinkSync(audioPath); } catch (e) {}
      await generateTTS(ttsText, audioPath, '+0%', PITCH);
      return getAudioDuration(audioPath);
    }, 3, price);
    copy = fit.text;
    ttsText = normalizeSpeechForTTS(copy);
    const finalAudioDuration = fit.duration;
    console.log(`[Job ${jobId}] ✅ TTS ajustado em ${fit.attempts} tentativa(s): ${finalAudioDuration.toFixed(1)}s/${durationSecs.toFixed(1)}s.`);
    const finalRender = buildFinalRenderPlan({
      visualDuration: durationSecs,
      audioDuration: finalAudioDuration,
      endingMargin: options.endingMargin || 0.3,
    });
    if (!finalRender.audioFits || finalRender.audioCutRisk) {
      throw new Error(`TTS não cabe na montagem sem corte: ${finalAudioDuration.toFixed(2)}s > ${durationSecs.toFixed(2)}s`);
    }

    // 8. Merge vídeo + áudio; corta somente a cauda visual após a fala.
    console.log(`[Job ${jobId}] Mesclando vídeo e áudio...`);
    await mergeAudioVideo(assembledVideoPath, audioPath, finalVideoPath, finalRender.finalDuration);
    const finalQuality = await getMediaInfo(finalVideoPath);

    // 9. Cleanup
    fs.unlinkSync(rawVideoPath);
    fs.unlinkSync(assembledVideoPath);
    fs.unlinkSync(audioPath);

    console.log(`[Job ${jobId}] Concluído! Arquivo: ${finalVideoPath}`);
    return {
      success: true,
      jobId,
      finalVideoPath,
      copy,
      ttsText,
      assemblyPlan: assembly.plan,
      inputQuality: assembly.inputQuality,
      outputQuality: finalQuality,
      assembledQuality: assembly.outputQuality,
      audioDuration: finalAudioDuration,
      finalDuration: finalRender.finalDuration,
      endingMargin: finalRender.endingMargin,
    };

  } catch (error) {
    console.error(`[Job ${jobId}] Falha:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  processShopeeVideoDubbing,
  generateDubbingCopy,
  buildDubbingPrompt,
  buildUniversalDubbingCta,
  buildFallbackDubbingScript,
  extractDubbingFacts,
  sanitizeDubbingScript,
  isSafeDubbingScript,
  normalizeSpeechForTTS,
  fitDubbingScriptToDuration,
};