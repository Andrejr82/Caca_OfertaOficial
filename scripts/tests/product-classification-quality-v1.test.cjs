'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyProductContext,
  validateProductTitle,
  isAccessoryOnlyProductTitle,
} = require('../product-title-quality.cjs');

test('Classificação Contextual — Peças de Reposição e Componentes (PART_ONLY_PRODUCT -> BLOCK)', () => {
  const parts = [
    'Bico Hotend 0.4mm em Latão para Impressora 3D Ender 3',
    'Agulha de Limpeza para Bico de Extrusora 3D',
    'Placa Controladora Silenciosa V4.2.7 para Ender 3',
    'Resistência Tubular de Aquecimento para Fritadeira Elétrica Air Fryer 1500W',
    'Cesto Antiaderente de Reposição para Airfryer Mondial 4L',
    'Tampa de Vidro de Reposição para Panela de Pressão Elétrica 5L',
    'Display Tela LCD Touch Screen de Reposição para Smartphone Galaxy A54',
    'Placa Mãe de Reposição para Notebook Dell Inspiron',
    'Junta do Cabeçote para Compressor de Ar Schulz',
    'Bateria Interna de Reposição para Notebook HP Pavilion',
  ];

  for (const title of parts) {
    const result = classifyProductContext({ title });
    assert.equal(result.action, 'BLOCK', `Título deveria ser BLOCK: ${title}`);
    assert.equal(
      result.reason,
      'PART_ONLY_PRODUCT',
      `Título deveria ter razão PART_ONLY_PRODUCT: ${title} (recebeu: ${result.reason})`
    );
    assert.equal(result.valid, false);
  }
});

test('Classificação Contextual — Acessórios Isolados (ACCESSORY_ONLY_PRODUCT -> BLOCK)', () => {
  const accessories = [
    'Capa Protetora de Silicone com Suporte para Notebook 15.6',
    'Película de Vidro Temperado 3D para Celular Galaxy S23',
    'Cabo Adaptador HDMI para VGA 1.8m',
    'Carregador de Parede Turbo 30W USB-C sem Cabo',
    'Suporte Articulado de Mesa para Monitor 17 a 34 Polegadas',
    'Case Gaveta Externa para HD SSD SATA 2.5 USB 3.0',
    'Mousepad Gamer Speed Extra Grande 90x40cm',
    'Cadarço Refletivo para Tênis de Corrida',
    'Chaveiro Protetor para AirTag Apple',
    'Organizador e Enrolador de Cabos de Mesa',
    'Kit de Limpeza 7 em 1 para Teclado e Fones de Ouvido',
  ];

  for (const title of accessories) {
    const result = classifyProductContext({ title });
    assert.equal(result.action, 'BLOCK', `Título deveria ser BLOCK: ${title}`);
    assert.equal(
      result.reason,
      'ACCESSORY_ONLY_PRODUCT',
      `Título deveria ter razão ACCESSORY_ONLY_PRODUCT: ${title} (recebeu: ${result.reason})`
    );
    assert.equal(result.valid, false);
  }
});

test('Classificação Contextual — Consumíveis Inadequados Isolados (CONSUMABLE_ONLY_PRODUCT -> BLOCK)', () => {
  const consumables = [
    'Filamento PLA 1kg 1.75mm para Impressora 3D Ender',
    'Filamento PETG Premium 1kg para Impressora 3D',
    'Refil de Almofada Lavável Mop para Robô Aspirador de Pó',
    'Refil Filtro HEPA para Robô Aspirador Xiaomi',
    'Papel Antiaderente Perfurado Descartável para Air Fryer 50 Unidades',
  ];

  for (const title of consumables) {
    const result = classifyProductContext({ title });
    assert.equal(result.action, 'BLOCK', `Título deveria ser BLOCK: ${title}`);
    assert.equal(
      result.reason,
      'CONSUMABLE_ONLY_PRODUCT',
      `Título deveria ter razão CONSUMABLE_ONLY_PRODUCT: ${title} (recebeu: ${result.reason})`
    );
    assert.equal(result.valid, false);
  }
});

test('Classificação Contextual — Produtos Principais Válidos (ALLOW)', () => {
  const mainProducts = [
    'Impressora 3D Creality Ender 3 V3 SE Bivolt',
    'Fritadeira Elétrica sem Óleo Air Fryer Mondial 4L 1500W Inox',
    'Notebook Dell Inspiron 15 Intel Core i5 16GB SSD 512GB Windows 11',
    'Smartphone Samsung Galaxy S23 5G 256GB 8GB RAM',
    'Monitor Gamer LG UltraGear 27 IPS 144Hz 1ms Full HD',
    'Robô Aspirador de Pó Inteligente Wi-Fi Bivolt',
    'Panela de Pressão Elétrica 5L Digital Timer Inox',
    'Smart TV 50 4K UHD LED Wi-Fi HDR',
    'Cafeteira Elétrica Programável 30 Xícaras Inox',
    'Liquidificador Turbo 1200W 3 Litros 12 Velocidades',
    'Aspirador de Pó Vertical 2 em 1 1300W',
  ];

  for (const title of mainProducts) {
    const result = classifyProductContext({ title });
    assert.equal(result.action, 'ALLOW', `Produto principal deveria ser ALLOW: ${title} (recebeu: ${result.action} / ${result.reason})`);
    assert.equal(result.valid, true);
    assert.equal(result.reason, null);
  }
});

test('Classificação Contextual — Falsos Positivos Evitados: Bundles, Kits e Combos com Produto Principal (ALLOW)', () => {
  const validBundles = [
    'Notebook Acer Aspire 5 Intel Core i5 8GB 512GB SSD + Capa Protetora + Mouse Sem Fio',
    'Furadeira de Impacto 1/2 650W com Maleta e Jogo de 50 Brocas',
    'Kit Gamer Completo: Teclado Mecânico RGB + Mouse Gamer 7200DPI + Headset 7.1',
    'Kit Teclado e Mouse Sem Fio Logitech MK220',
    'Smartphone Xiaomi Redmi Note 13 + Capa Anti-impacto + Película de Vidro 3D',
    'Air Fryer Fritadeira 4L + Forma de Silicone + Pinça Pegadora Inox',
    'Impressora 3D com Bico Extra e 200g de Filamento Incluso',
    'Cadeira de Escritório Ergonômica com Suporte Lombar e Braços Ajustáveis',
    'Cafeteira com Filtro Permanente e Jarra Inox',
  ];

  for (const title of validBundles) {
    const result = classifyProductContext({ title });
    assert.equal(
      result.action,
      'ALLOW',
      `Bundle válido NÃO deve ser bloqueado: ${title} (recebeu: ${result.action} / ${result.reason})`
    );
    assert.equal(result.valid, true);
    assert.equal(result.reason, null);
  }
});

test('Classificação Contextual — Casos Ambíguos (REVIEW)', () => {
  const ambiguousCases = [
    { title: 'Kit Acessórios Multiuso com Estojo para Viagem', category: { name: 'Outros' } },
    { title: 'Conjunto Periféricos Multiuso para Escritório', category: { name: 'Informática' } },
  ];

  for (const item of ambiguousCases) {
    const result = classifyProductContext(item);
    assert.equal(
      result.action,
      'REVIEW',
      `Item ambíguo deveria ter ação REVIEW: ${item.title} (recebeu: ${result.action} / ${result.reason})`
    );
    // Em modo restrito (padrão de publicação/auto-admissão), REVIEW não é aprovado cegamente
    assert.equal(result.reason, 'AMBIGUOUS_PRODUCT_CLASS');
  }
});

test('Compatibilidade Regressiva — validateProductTitle e isAccessoryOnlyProductTitle', () => {
  assert.equal(typeof validateProductTitle, 'function');
  assert.equal(typeof isAccessoryOnlyProductTitle, 'function');

  // Acessório clássico deve continuar sendo detectado
  const accRes = validateProductTitle('Capa de Silicone para Celular');
  assert.equal(accRes.valid, false);
  assert.ok(['ACCESSORY_ONLY_PRODUCT', 'PART_ONLY_PRODUCT', 'CONSUMABLE_ONLY_PRODUCT'].includes(accRes.reason));

  // Produto principal deve ser válido
  const mainRes = validateProductTitle('Notebook Dell Inspiron 15 i5 16GB SSD 512GB');
  assert.equal(mainRes.valid, true);
  assert.equal(mainRes.reason, null);
});
