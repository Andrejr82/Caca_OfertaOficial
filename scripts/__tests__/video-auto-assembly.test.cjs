const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  createJobWorkspace,
  selectAutoSegments,
  buildVisualSpeechContext,
  buildFinalRenderPlan,
  shouldRegenerateSpeech,
} = require('../video-auto-assembly.cjs');

test('seleciona segmentos curtos, ordenados e sem sobreposição', () => {
  const plan = selectAutoSegments({ duration: 16.56, targetDuration: 12, boundaries: [4.2, 8.4, 12.6] });

  assert.equal(plan.totalDuration, 12);
  assert.ok(plan.segments.length >= 3 && plan.segments.length <= 5);
  assert.equal(plan.segments[0].start, 0);
  for (let index = 1; index < plan.segments.length; index += 1) {
    assert.ok(plan.segments[index].start >= plan.segments[index - 1].end);
  }
  assert.ok(plan.segments.every((segment) => segment.end > segment.start));
});

test('adapta montagem quando a origem é menor que o alvo', () => {
  const plan = selectAutoSegments({ duration: 6.5, targetDuration: 12, boundaries: [] });
  assert.equal(plan.totalDuration, 6.5);
  assert.deepEqual(plan.segments, [{ start: 0, end: 6.5, duration: 6.5, role: 'full_source' }]);
});

test('contexto visual é estruturado para o prompt sem amarrar a uma categoria', () => {
  const context = buildVisualSpeechContext({
    totalDuration: 12,
    segments: [
      { start: 0, end: 3, role: 'opening' },
      { start: 5, end: 8, role: 'detail' },
      { start: 10, end: 12, role: 'closing' },
    ],
  });

  assert.match(context, /abertura/u);
  assert.match(context, /detalhe/u);
  assert.match(context, /encerramento/u);
});

test('regenera fala quando o TTS excede a duração útil', () => {
  assert.equal(shouldRegenerateSpeech(13, 12), true);
  assert.equal(shouldRegenerateSpeech(12.4, 12), true);
  assert.equal(shouldRegenerateSpeech(12, 12), false);
});

test('corta somente a cauda visual e preserva a fala', () => {
  const render = buildFinalRenderPlan({ visualDuration: 12, audioDuration: 9.12, endingMargin: 0.3 });
  assert.equal(render.finalDuration, 9.42);
  assert.equal(render.audioFits, true);
  assert.equal(render.audioCut, false);
  assert.equal(render.trimsVisualTail, true);
});

test('não autoriza corte final quando o TTS ainda excede o visual', () => {
  const render = buildFinalRenderPlan({ visualDuration: 12, audioDuration: 12.2, endingMargin: 0.3 });
  assert.equal(render.audioFits, false);
  assert.equal(render.audioCut, false);
  assert.equal(render.audioCutRisk, true);
  assert.equal(render.finalDuration, 12);
});

test('workspace usa identidade do job e não compartilha artefatos', () => {
  const first = createJobWorkspace('C:/tmp/videos', 'job-a');
  const second = createJobWorkspace('C:/tmp/videos', 'job-b');
  assert.notEqual(first.root, second.root);
  assert.match(first.input, /job-a/u);
  assert.match(second.output, /job-b/u);
});

test('Oracle passa o mesmo jobId para o dubber e o storage', () => {
  const oracleSource = fs.readFileSync(path.join(__dirname, '..', 'oracle-api.cjs'), 'utf8');
  assert.match(oracleSource, /processShopeeVideoDubbing\(videoUrl, title, price \|\| 'Não informado', \{ jobId \}\)/u);
  assert.match(oracleSource, /const storagePath = `\$\{tenantId\}\/\$\{jobId\}\.mp4`/u);
});

test('dubber normal chama análise e montagem antes da geração de copy', () => {
  const dubberSource = fs.readFileSync(path.join(__dirname, '..', 'video-dubber.cjs'), 'utf8');
  assert.match(dubberSource, /const assembly = await analyzeAndAssemble/u);
  assert.ok(dubberSource.indexOf('analyzeAndAssemble') < dubberSource.indexOf('generateDubbingCopy(title, price, durationSecs'));
});
