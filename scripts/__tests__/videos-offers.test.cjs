const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const videosClient = fs.readFileSync(path.join(root, 'src/app/(dashboard)/videos/VideosClient.tsx'), 'utf8');
const deleteRoutePath = path.join(root, 'src/app/api/videos/jobs/[id]/route.ts');
const deleteRoute = fs.existsSync(deleteRoutePath) ? fs.readFileSync(deleteRoutePath, 'utf8') : '';
const popup = fs.readFileSync(path.join(root, 'extensions/shopee-video-extractor/popup.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'extensions/shopee-video-extractor/content.js'), 'utf8');
const { selectPrimaryPrice } = require(path.join(root, 'extensions/shopee-video-extractor/price-parser.js'));
const productParserPath = path.join(root, 'extensions/shopee-video-extractor/product-parser.js');
const { isGenericShopeeTitle, selectProductTitle } = fs.existsSync(productParserPath)
  ? require(productParserPath)
  : { isGenericShopeeTitle: () => false, selectProductTitle: () => null };

test('vídeos: exclusão exige tenant, remove artefato e exclui o job', () => {
  assert.match(deleteRoute, /export async function DELETE/u);
  assert.match(deleteRoute, /\.eq\("user_id", userData\.user\.id\)/u);
  assert.match(deleteRoute, /storage\.from\("videos"\)\.remove/u);
  assert.match(deleteRoute, /from\("video_jobs"\)[\s\S]*\.delete\(\)/u);
});

test('vídeos: botão remove somente o job confirmado e atualiza a lista', () => {
  assert.match(videosClient, /Excluir/u);
  assert.match(videosClient, /method: "DELETE"/u);
  assert.match(videosClient, /setJobs\(\(current\) => current\.filter\(\(job\) => job\.id !== id\)\)/u);
});

test('vídeos: seletor usa short_name antes do título completo', () => {
  assert.match(videosClient, /offer\.short_name \|\| offer\.product_name/u);
});

test('extrator: caso real rejeita título institucional e aceita produto real', () => {
  assert.equal(selectProductTitle(['Shopee Brasil Ofertas incríveis. Melhores preços do mercado']), null);
  assert.equal(selectProductTitle([
    'Shopee Brasil Ofertas incríveis. Melhores preços do mercado',
    'Mixer 3 Em 1 Power Inox Elgin 1000w'
  ]), 'Mixer 3 Em 1 Power Inox Elgin 1000w');
});

test('extrator: rejeita variantes normalizadas do título institucional', () => {
  const institutionalVariants = [
    'SHOPEE BRASIL OFERTAS INCRÍVEIS. MELHORES PREÇOS DO MERCADO',
    '  Shopee   Brasil   Ofertas incríveis.   Melhores preços do mercado  ',
    'Shopee Brasil — Ofertas incríveis. Melhores preços do mercado',
    'Shopee Brasil - Ofertas incríveis Melhores preços do mercado | Shopee',
    'Shopee Brasil: Ofertas incríveis, melhores preços do mercado'
  ];

  for (const title of institutionalVariants) {
    assert.equal(isGenericShopeeTitle(title), true, title);
    assert.equal(selectProductTitle([title]), null, title);
  }
});

test('extrator: preserva produto legítimo que contém Shopee', () => {
  assert.equal(
    selectProductTitle(['Caneca Shopee Brasil personalizada']),
    'Caneca Shopee Brasil personalizada'
  );
});

test('extrator: não envia fallback genérico como produto', () => {
  assert.match(popup, /data\.title && data\.shopId && data\.itemId/u);
  assert.doesNotMatch(content, /title = document\.title\.replace/u);
});

test('extrator: R$ 0 não passa quando existe preço principal positivo', () => {
  assert.deepEqual(selectPrimaryPrice([
    { text: 'R$ 0', className: 'generic-page-price' },
    { text: 'R$ 2.830,39', className: 'product-price current-price' },
  ]), { raw: 'R$ 2.830,39', value: 2830.39, source: 'dom.primary-price' });
  assert.match(content, /priceValue/u);
  assert.match(popup, /Number\(data\.priceValue\) > 0/u);
});
