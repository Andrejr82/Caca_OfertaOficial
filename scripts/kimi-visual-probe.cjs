const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function readKimiConfig(env = process.env) {
  return {
    baseUrl: String(env.KIMI_BASE_URL || env['url base'] || '').trim(),
    model: String(env.KIMI_MODEL || env['Model Id'] || '').trim(),
    apiKey: String(env.KIMI_API_KEY || env['API Key'] || '').trim(),
  };
}

function readKimiEnvFile(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/u)) {
    const match = line.match(/^\s*([^#=][^=]*)=(.*)$/u);
    if (!match) continue;
    values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/gu, '');
  }
  return values;
}

function parseVisualAnalysis(value) {
  try {
    const text = String(value || '').replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed.product_visible !== 'boolean' || typeof parsed.product_type !== 'string'
      || !Array.isArray(parsed.visible_attributes) || !parsed.visible_attributes.every((item) => typeof item === 'string')
      || !Array.isArray(parsed.scenes) || !parsed.scenes.every((scene) => scene
        && typeof scene.frame === 'string'
        && typeof scene.description === 'string'
        && typeof scene.useful === 'boolean')
      || !Array.isArray(parsed.uncertain_observations)
      || !parsed.uncertain_observations.every((item) => typeof item === 'string')) return null;
    return {
      product_visible: parsed.product_visible,
      product_type: parsed.product_type,
      visible_attributes: parsed.visible_attributes,
      scenes: parsed.scenes,
      uncertain_observations: parsed.uncertain_observations,
    };
  } catch {
    return null;
  }
}

function buildVisualAnalysisRequest({ title, marketplace, shopId, itemId, frames, model = 'moonshotai/kimi-k3-free' }) {
  const identity = [shopId && `shopId=${shopId}`, itemId && `itemId=${itemId}`].filter(Boolean).join(', ') || 'não disponível';
  const text = [
    'Analise visualmente este vídeo Shopee a partir dos frames.',
    'Retorne SOMENTE JSON válido com exatamente as chaves product_visible (boolean), product_type (string), visible_attributes (array de strings), scenes (array com frame, description, useful boolean) e uncertain_observations (array de strings).',
    `Título real: ${title}`,
    `Marketplace: ${marketplace}`,
    `Identidade: ${identity}`,
    'Afirme somente o que é visualmente observável. Não infira potência, capacidade, material, durabilidade, benefício, vendas ou qualidade. Use uncertain_observations para qualquer dúvida.',
  ].join('\n');
  return {
    model,
    temperature: 0.1,
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text },
        ...frames.map((frame) => ({ type: 'image_url', image_url: { url: frame.dataUrl, detail: 'low' } })),
      ],
    }],
  };
}

function responseText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) return content.map((part) => part.text || '').join('');
  return String(content || '');
}

async function callKimi({ request, config, fetchImpl = fetch }) {
  if (!config.baseUrl || !config.model || !config.apiKey) throw new Error('KIMI_CONFIG_INCOMPLETE');
  const response = await fetchImpl(`${config.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, model: config.model }),
  });
  if (!response.ok) {
    const body = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`KIMI_HTTP_${response.status}${body ? `:${body.slice(0, 180)}` : ''}`);
  }
  return response.json();
}

async function extractRepresentativeFrames(videoPath, { outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-frames-')), execFileImpl = execFileAsync } = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const { stdout } = await execFileImpl('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath]);
  const duration = Number.parseFloat(String(stdout).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('VIDEO_DURATION_UNAVAILABLE');
  const points = [0, 0.25, 0.5, 0.75, Math.max(0, (duration - 0.25) / duration)];
  const frames = [];
  for (let index = 0; index < points.length; index += 1) {
    const timestamp = Math.min(duration - 0.01, duration * points[index]);
    const outputPath = path.join(outputDir, `frame-${index + 1}.jpg`);
    await execFileImpl('ffmpeg', ['-y', '-ss', timestamp.toFixed(3), '-i', videoPath, '-frames:v', '1', '-q:v', '3', outputPath]);
    frames.push({ label: `${Math.round(points[index] * 100)}%`, path: outputPath, dataUrl: `data:image/jpeg;base64,${fs.readFileSync(outputPath).toString('base64')}` });
  }
  return { duration, frames };
}

function buildVisualAwareScript(title, analysis) {
  const normalizedTitle = String(title || '').replace(/\s+/gu, ' ').trim();
  const lower = normalizedTitle.toLowerCase();
  let identity = 'produto';
  if (lower.includes('calça') || lower.includes('pantalona')) identity = 'calça pantalona';
  else if (lower.includes('aspirador')) identity = 'aspirador portátil';
  else if (lower.includes('mixer')) identity = 'mixer';
  else if (lower.includes('cafeteira')) identity = 'cafeteira';
  else identity = normalizedTitle.split(/\s+/u).slice(0, 3).join(' ');

  const safeAttributes = ['pantalona', 'bolso', 'cintura alta', 'portátil', 'sem fio', 'inox', 'bica móvel']
    .filter((attribute) => lower.includes(attribute) && analysis.visible_attributes.some((item) => item.toLowerCase().includes(attribute)));
  const usefulScene = analysis.scenes.find((scene) => scene.useful && scene.description.trim());
  const details = safeAttributes.length ? ` com ${safeAttributes.slice(0, 2).join(' e ')}` : '';
  const visual = usefulScene ? ` O vídeo mostra ${usefulScene.description.trim().replace(/[.!?]+$/gu, '')}.` : '';
  return `Veja esta ${identity}${details}.${visual} A apresentação ajuda a visualizar o produto em uso. Você encontra na Shopee. Acesse o link na publicação.`
    .replace(/\s+/gu, ' ')
    .trim();
}

async function runKimiVisualProbe({ videoPath, title, marketplace = 'Shopee', shopId = null, itemId = null, config = readKimiConfig(), fetchImpl = fetch } = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-visual-probe-'));
  try {
    const extracted = await extractRepresentativeFrames(videoPath, { outputDir: workspace });
    const capabilityRequest = buildVisualAnalysisRequest({ title, marketplace, shopId, itemId, frames: extracted.frames.slice(0, 1), model: config.model });
    let capabilityResponse;
    try {
      capabilityResponse = await callKimi({ request: capabilityRequest, config, fetchImpl });
    } catch (error) {
      return { status: 'blocked', reason: error.message, frames: extracted.frames, duration: extracted.duration };
    }
    const capabilityAnalysis = parseVisualAnalysis(responseText(capabilityResponse));
    if (!capabilityAnalysis) return { status: 'blocked', reason: 'KIMI_IMAGE_OR_JSON_UNSUPPORTED', frames: extracted.frames, duration: extracted.duration };
    const request = buildVisualAnalysisRequest({ title, marketplace, shopId, itemId, frames: extracted.frames, model: config.model });
    let response;
    try {
      response = await callKimi({ request, config, fetchImpl });
    } catch (error) {
      return { status: 'analysis_failed', reason: error.message, frames: extracted.frames, duration: extracted.duration };
    }
    const analysis = parseVisualAnalysis(responseText(response));
    if (!analysis) return { status: 'analysis_failed', reason: 'KIMI_INVALID_JSON', frames: extracted.frames, duration: extracted.duration };
    return { status: 'found', duration: extracted.duration, frames: extracted.frames, analysis, script: buildVisualAwareScript(title, analysis) };
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

module.exports = {
  readKimiConfig,
  readKimiEnvFile,
  parseVisualAnalysis,
  buildVisualAnalysisRequest,
  buildVisualAwareScript,
  extractRepresentativeFrames,
  callKimi,
  runKimiVisualProbe,
};
