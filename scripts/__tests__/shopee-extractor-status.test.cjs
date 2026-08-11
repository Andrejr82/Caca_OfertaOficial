const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const popup = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', 'shopee-video-extractor', 'popup.js'), 'utf8');
const content = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', 'shopee-video-extractor', 'content.js'), 'utf8');

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

test('payload preserva identidade Shopee para autoridade de preço', () => {
  assert.match(content, /product\\\/\(\\d\+\).*i\\\.\(\\d\+\)\\\.\(\\d\+\)/su);
  assert.match(content, /shopId, itemId/u);
  assert.match(popup, /price-parser\.js/u);
  assert.match(popup, /shopId: currentShopId/u);
  assert.match(popup, /itemId: currentItemId/u);
});
