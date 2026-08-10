const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const popup = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', 'shopee-video-extractor', 'popup.js'), 'utf8');

test('mensagem do extrator não promete duração fixa', () => {
  assert.doesNotMatch(popup, /Isso pode levar de 1 a 2 minutos/u);
});

test('mensagem informa preparação e processamento assíncrono', () => {
  assert.match(popup, /Preparando vídeo/u);
  assert.match(popup, /Enviando para a Oracle preparar o vídeo/u);
  assert.match(popup, /Montagem, narração e renderização em andamento/u);
});

test('troca de aba não cancela o processamento', () => {
  assert.doesNotMatch(popup, /visibilitychange|beforeunload|abort\(/iu);
});
