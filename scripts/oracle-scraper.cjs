/**
 * ═══════════════════════════════════════════════════════════════
 *  ORACLE-SCRAPER.CJS — Robô Caçador de Ofertas V2 (In-House)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Processo permanente gerenciado pelo PM2.
 * Roda a cada 4 horas: raspa as lojas (Crawlee), formata (Groq),
 * gera links de afiliado e posta rascunhos.
 */

'use strict';

global.WebSocket = require('ws');

const os = require('os');
os.freemem = () => 4 * 1024 * 1024 * 1024; // 4 GB
os.totalmem = () => 4 * 1024 * 1024 * 1024; // 4 GB
const fs           = require('fs');
const cron         = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const ws           = require('ws');
const { PlaywrightCrawler, Dataset, ProxyConfiguration } = require('crawlee');
const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());

process.env.CRAWLEE_AVAILABLE_MEMORY_RATIO = '10.0';
process.env.CRAWLEE_MEMORY_MBYTES = '4096';
const axios        = require('axios');
require('dotenv').config({ path: '.env.local' });
const { validateHtml, validateProduct, getScrapingPrompt, sanitizeScrapedData } = require('./scraper-adapter.cjs');


// ─── Supabase Admin Client ────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { webSocketImpl: ws },
  }
);

// ─── Configurações ────────────────────────────────────────────
process.env.CRAWLEE_MEMORY_MBYTES = '3072';
const ADMIN_USER_ID   = '7a9ca7b7-f464-46e0-a9de-9b322c73628a'; // ID do André
const OFFERS_PER_STORE = 6; // Teto por query aumentado para ampliar a descoberta
const CLEANUP_DAYS     = 7;
const CRON_SCHEDULE    = '0 */4 * * *';
const VIP_SLOTS        = 20; 
const APPROVAL_SCORE   = 3.5;

const ML_AFFILIATE_ID      = process.env.MERCADO_LIVRE_AFFILIATE_ID || '';
const AMAZON_TAG           = process.env.AMAZON_PARTNER_TAG || '';
const MAGALU_PARTNER_ID    = process.env.MAGALU_PARTNER_ID || '';
const SHOPEE_ADMITAD_ID    = process.env.SHOPEE_ADMITAD_CAMPAIGN_ID || ''; // Preencher no .env.local

// ─── LLM Provider Setup ────────────────────────────────────────
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'cerebras';
const LLM_FALLBACK = process.env.LLM_FALLBACK || 'groq';

// Configurações dos providers
const PROVIDER_CONFIG = {
  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY,
    baseURL: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    model: process.env.CEREBRAS_MODEL || 'gpt-oss-120b',
    maxTokens: 8000, // Maior limite para Cerebras
    productsToProcess: 10 // Menos produtos para não cortar a resposta
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    apiKey2: process.env.GROQ_API_KEY_2,
    maxTokens: 4000,
    productsToProcess: 15
  }
};

/**
 * Função genérica para chamar LLM em formato OpenAI-compatible
 */
async function callLLM(messages, providerType = LLM_PROVIDER, config = {}) {
  const providerConfig = PROVIDER_CONFIG[providerType];
  
  if (!providerConfig || !providerConfig.apiKey) {
    throw new Error(`Provider ${providerType} não configurado corretamente`);
  }
  
  const url = (providerConfig.baseURL).replace(/\/$/, '') + '/chat/completions';
  
  const body = {
    model: providerConfig.model,
    messages: messages,
    temperature: config.temperature ?? 0.1,
    max_tokens: config.maxTokens ?? providerConfig.maxTokens ?? 4000,
    response_format: config.responseFormat
  };
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${providerConfig.apiKey}`
  };
  
  const response = await axios.post(url, body, { headers });
  
  // Cerebras puts content in message.reasoning, others in message.content
  if (response.data.choices && response.data.choices[0]) {
    const msg = response.data.choices[0].message;
    if (msg.reasoning && !msg.content) {
      response.data.choices[0].message.content = msg.reasoning;
    }
  }
  
  if (response.data.usage) {
    cycleMetrics.totalTokens += response.data.usage.total_tokens;
  }
  
  return response.data;
}

/**
 * Tenta o provider principal, se falhar tenta o fallback
 */
async function callLLMWithFallback(messages, config = {}) {
  let lastError = null;
  
  // Tenta o provider principal
  try {
    console.log(`  [LLM] Usando provider principal: ${LLM_PROVIDER}`);
    const result = await callLLM(messages, LLM_PROVIDER, config);
    
    // Check if response was cut off
    const finishReason = result.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn(`  [LLM] Provider ${LLM_PROVIDER} response cut off (finish_reason: length), using fallback`);
      lastError = new Error('Response cut off');
    } else {
      return result;
    }
  } catch (error) {
    console.warn(`  [LLM] Provider ${LLM_PROVIDER} falhou: ${error.message}`);
    lastError = error;
  }
  
  // Tenta o fallback
  try {
    console.log(`  [LLM] Usando fallback: ${LLM_FALLBACK}`);
    
    if (LLM_FALLBACK === 'groq' && PROVIDER_CONFIG.groq.apiKey2) {
      // Para Groq, tenta rotacionar chaves
      let groqError = null;
      const keys = [PROVIDER_CONFIG.groq.apiKey, PROVIDER_CONFIG.groq.apiKey2].filter(Boolean);
      
      for (let i = 0; i < keys.length; i++) {
        try {
          console.log(`  [Groq] Tentando chave ${i + 1}...`);
          const url = (PROVIDER_CONFIG.groq.baseURL).replace(/\/$/, '') + '/chat/completions';
          const body = {
            model: PROVIDER_CONFIG.groq.model,
            messages: messages,
            temperature: config.temperature ?? 0.1,
            max_tokens: config.maxTokens ?? PROVIDER_CONFIG.groq.maxTokens,
            response_format: config.responseFormat
          };
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keys[i]}`
          };
          const response = await axios.post(url, body, { headers });
          
          if (response.data.usage) {
            cycleMetrics.totalTokens += response.data.usage.total_tokens;
          }
          
          return response.data;
        } catch (err) {
          groqError = err;
        }
      }
      
      throw groqError;
    }
    
    return await callLLM(messages, LLM_FALLBACK, config);
  } catch (fallbackError) {
    console.error(`  [LLM] Fallback ${LLM_FALLBACK} também falhou: ${fallbackError.message}`);
    throw lastError || fallbackError;
  }
}
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
const RAKUTEN_NETSHOES_MID = process.env.RAKUTEN_NETSHOES_MID || '43984';

// #region debug-point A:golden-queries-audit-bootstrap
const SCRAPER_AUDIT_ENV_FILE = '.dbg/golden-queries-audit.env';
const SCRAPER_AUDIT_LOG_FILE = '.dbg/trae-debug-log-golden-queries-audit.ndjson';
const SCRAPER_AUDIT_RUN_ID = process.env.SCRAPER_AUDIT_RUN_ID || 'pre-fix';
const SCRAPER_AUDIT_STATE = {
  currentStore: null,
  currentQuery: null,
  currentCategory: null,
  currentVariant: null,
  queryStartedAt: 0,
  cycleStartedAt: 0
};

function emitAuditEvent(hypothesisId, location, msg, data = {}) {
  const payload = {
    sessionId: 'golden-queries-audit',
    runId: SCRAPER_AUDIT_RUN_ID,
    hypothesisId,
    location,
    msg: `[DEBUG] ${msg}`,
    data,
    ts: Date.now()
  };

  try {
    fs.appendFileSync(SCRAPER_AUDIT_LOG_FILE, `${JSON.stringify(payload)}\n`);
  } catch (_) {}

  if (typeof fetch !== 'function') return;
  let serverUrl = 'http://127.0.0.1:7777/event';
  let sessionId = 'golden-queries-audit';
  try {
    const envRaw = fs.readFileSync(SCRAPER_AUDIT_ENV_FILE, 'utf8');
    serverUrl = envRaw.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || serverUrl;
    sessionId = envRaw.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
  } catch (_) {}

  payload.sessionId = sessionId;

  fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

function averageNumbers(values = []) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function incrementCounter(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function bucketConfidence(confidence) {
  if (confidence < 40) return '0-39';
  if (confidence < 60) return '40-59';
  if (confidence < 80) return '60-79';
  return '80-100';
}

function buildValidationPreview(products, storeName) {
  const preview = {
    found: products.length,
    approved: 0,
    rejected: 0,
    avgConfidence: 0,
    rejectStats: {},
    confidenceBuckets: {},
    missingStats: {
      title: 0,
      price: 0,
      image: 0,
      url: 0,
      category: 0,
      marketplace: storeName ? 0 : products.length
    }
  };
  const confidences = [];

  products.forEach((product) => {
    const title = String(product?.title || product?.product_name || '').trim();
    const image = String(product?.image || product?.image_url || '').trim();
    const url = String(product?.url || product?.original_url || '').trim();
    const rawPrice = product?.price ?? product?.current_price ?? 0;
    const price = typeof rawPrice === 'number'
      ? rawPrice
      : parseFloat(String(rawPrice).replace(/[R$\s.]/g, '').replace(',', '.')) || 0;

    if (!title) preview.missingStats.title += 1;
    if (!price) preview.missingStats.price += 1;
    if (!image || image === 'null') preview.missingStats.image += 1;
    if (!url) preview.missingStats.url += 1;
    if (!product?.category) preview.missingStats.category += 1;

    const validation = validateProduct(product, storeName);
    confidences.push(validation.confidence);
    incrementCounter(preview.confidenceBuckets, bucketConfidence(validation.confidence));

    if (validation.valid) {
      preview.approved += 1;
    } else {
      preview.rejected += 1;
      incrementCounter(preview.rejectStats, validation.rejectReason || 'UNKNOWN');
    }
  });

  preview.avgConfidence = averageNumbers(confidences);
  return preview;
}
// #endregion

// ─── Sistema de Descoberta (Golden Queries) ───────────────────
const QUERY_VARIANT_ORDER = ['popular', 'volume', 'brand', 'generic', 'promo'];
const STORE_QUERY_SETTINGS = {
  'Mercado Livre': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Amazon': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Magalu': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Shopee': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Shein': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Netshoes': { categoriesPerRun: 12, queriesPerCategory: 2 }
};

const MARKETPLACE_ORDER = ['Mercado Livre', 'Amazon', 'Magalu', 'Netshoes', 'Shopee', 'Shein'];

const ELETRONICOS = [
  'Echo Pop',
  'Echo Show 8',
  'Kindle Paperwhite 16GB',
  'Fire TV Stick 4K Max',
  'Galaxy SmartTag2',
  'Instax Mini 12',
  'Carregador GaN Baseus 65W',
  'Power bank I2GO 20000mAh',
  'Mini projetor HY320',
  'Dock station USB-C Ugreen'
];

const GAMES = [
  'PlayStation 5 Slim',
  'PlayStation 5 Digital',
  'Nintendo Switch OLED',
  'Xbox Series S Carbon Black',
  'Controle DualSense Midnight Black',
  'Controle Xbox Robot White',
  'Mario Kart 8 Deluxe',
  'Zelda Tears of the Kingdom',
  'EA Sports FC 26',
  'Gift card PlayStation Store'
];

const HARDWARE = [
  'RTX 4060 8GB',
  'RTX 4070 Super',
  'Radeon RX 7800 XT',
  'Ryzen 7 8700G',
  'Ryzen 5 5600',
  'Intel Core i7 14700K',
  'SSD Kingston NV3 1TB',
  'SSD WD Black SN770 1TB',
  'Memoria DDR5 Kingston Fury 32GB',
  'Fonte Corsair RM750e'
];

const INFORMATICA = [
  'Notebook Lenovo LOQ',
  'Notebook ASUS Vivobook 15',
  'Notebook Dell Inspiron 15',
  'Notebook Samsung Galaxy Book4',
  'Monitor LG Ultrawide 29',
  'Mouse Logitech G502 Hero',
  'Teclado mecanico Redragon Kumara',
  'Webcam Logitech C920s',
  'Cadeira gamer ThunderX3 TGC12',
  'Impressora Epson EcoTank L3250'
];

const CASA_INTELIGENTE = [
  'Lampada smart Positivo Casa Inteligente',
  'Smart plug Intelbras EWS 301',
  'Fechadura digital Intelbras FR 101',
  'Camera TP-Link Tapo C200',
  'Robo aspirador Xiaomi S10',
  'Sensor de presenca smart Zemismart',
  'Interruptor smart NovaDigital Wi-Fi',
  'Video porteiro Intelbras Allo W3',
  'Controle universal smart Positivo',
  'Fita LED smart RGBIC Tuya'
];

const COZINHA = [
  'Air fryer Philips Walita 6.2L',
  'Air fryer oven Mondial 12L',
  'Cafeteira Nespresso Essenza Mini',
  'Cafeteira Tres Coracoes Lov',
  'Panela de pressao eletrica Electrolux PCC20',
  'Kit churrasco Tramontina 15 pecas',
  'Jogo de facas Tramontina Plenus',
  'Processador Oster 3 em 1',
  'Mixer Philips Walita Daily',
  'Conjunto de panelas Tramontina Solar'
];

const ELETRODOMESTICOS = [
  'Geladeira Brastemp Inverse 447L',
  'Lava e seca Samsung 11kg',
  'Maquina de lavar Electrolux 12kg',
  'Lava-loucas Brastemp 14 servicos',
  'Cooktop Electrolux 5 bocas',
  'Forno eletrico Fischer Fit Line',
  'Micro-ondas LG 30L NeoChef',
  'Freezer vertical Consul 231L',
  'Ar-condicionado LG Dual Inverter 12000',
  'Cervejeira Midea Flex 96L'
];

const ELETROPORTATEIS = [
  'Aspirador vertical WAP Power Speed',
  'Escova secadora Mondial Golden Rose',
  'Secador Taiff Style 2000W',
  'Vaporizador portatil Black+Decker',
  'Sanduicheira Cadence Click',
  'Grill George Foreman Family',
  'Chaleira eletrica Electrolux EEK10',
  'Liquidificador Oster 1400 Full',
  'Multiprocessador Philco PMP1600',
  'Passadeira a vapor Arno Steam Power'
];

const FERRAMENTAS = [
  'Furadeira Bosch GSB 13 RE',
  'Parafusadeira Makita DF333D',
  'Kit ferramentas Bosch 103 pecas',
  'Lavadora WAP Ousada Plus 2200',
  'Serra marmore Makita 4100NH3Z',
  'Jogo de chaves Gedore Red',
  'Trena laser Bosch GLM 40',
  'Soprador termico Vonder STV 1500',
  'Martelete DeWalt D25133K',
  'Serra tico-tico Bosch GST 700'
];

const AUTOMOTIVO = [
  'Central multimidia Pioneer DMH-A5450BT',
  'Aspirador automotivo Black+Decker ADV1200',
  'Carregador veicular Baseus SuperCharge',
  'Camera veicular 70mai Dash Cam A500S',
  'Calibrador portatil Xiaomi 2',
  'Lampada Philips CrystalVision H4',
  'Suporte celular veicular I2GO MagSafe',
  'Bateria Moura 60Ah',
  'Compressor de ar portatil Multilaser',
  'Sensor de estacionamento Tech One'
];

const PET = [
  'Fonte para gato Catit Flower',
  'Caixa de areia fechada Furacao Pet',
  'Racao Premier Formula Caes Adultos',
  'Racao Royal Canin Mini Indoor',
  'Caminha pet impermeavel Baw Waw',
  'Arranhador gato 3 andares',
  'Bebedouro automatico pet 2 litros',
  'Tapete higienico SuperSecao 30 unidades',
  'Brinquedo Kong Classic medio',
  'Escova removedora de pelos pet'
];

const SAUDE = [
  'Aparelho de pressao Omron HEM-7122',
  'Massageador pistola Relaxmedic',
  'Oximetro G-Tech OLED',
  'Inalador nebulizador Omron NE-C803',
  'Balanca bioimpedancia Xiaomi Mi Body',
  'Escova eletrica Oral-B Vitality',
  'Irrigador oral Waterpik Cordless',
  'Travesseiro ortopedico Nasa',
  'Monitor de glicemia Accu-Chek Guide',
  'Termometro infravermelho G-Tech'
];

const FITNESS = [
  'Bicicleta ergometrica Dream MAX V',
  'Esteira eletrica Polimet EP-1600',
  'Halteres ajustaveis 20kg',
  'Corda speed rope de cross training',
  'Caneleira 5kg par',
  'Kettlebell 12kg emborrachado',
  'Bike spinning Gallant Elite',
  'Banco de supino dobravel',
  'Kit mini bands tecido',
  'Roda abdominal com apoio'
];

const SUPLEMENTOS = [
  'Creatina Max Titanium 300g',
  'Creatina Soldiers Nutrition 500g',
  'Whey Growth concentrado 1kg',
  'Whey Max Titanium 100% whey',
  'Pre-treino Horus 300g',
  'Albumina Naturovos 500g',
  'Multivitaminico Growth',
  'Omega 3 Growth',
  'Colageno hidrolisado Sanavita',
  'Barra de proteina Bold'
];

const MODA_MASCULINA = [
  'Camiseta Insider Tech T-Shirt',
  'Jaqueta corta vento Nike Club',
  'Kit cueca Lupo boxer',
  'Camisa polo Reserva piquet',
  'Bermuda Nike Dri-FIT Challenger',
  'Moletom Adidas Essentials',
  'Camisa social slim masculina',
  'Carteira couro masculina Fasolo',
  'Jaqueta puffer masculina',
  'Kit camisetas basicas Hering'
];

const MODA_FEMININA = [
  'Vestido midi canelado',
  'Conjunto academia feminino seamless',
  'Pijama americano feminino',
  'Bolsa tote feminina estruturada',
  'Jaqueta puffer feminina',
  'Calca wide leg jeans feminina',
  'Modelador cintura alta feminino',
  'Kit lingerie microfibra',
  'Camisa oversized feminina',
  'Vestido festa midi acetinado'
];

const TENIS = [
  'Nike Air Max Excee',
  'Nike Revolution 7',
  'Adidas Ultraboost Light',
  'Olympikus Corre 3',
  'Olympikus Corre Max',
  'Mizuno Wave Creation 26',
  'Puma Carina BDP',
  'Under Armour Charged Slight 3',
  'New Balance 530',
  'Vans Old Skool preto'
];

const RELOGIOS = [
  'Apple Watch SE GPS',
  'Galaxy Watch7 BT',
  'Huawei Watch GT 5',
  'Redmi Watch 5 Lite',
  'Casio G-Shock GA-2100',
  'Amazfit Balance',
  'Smartwatch QCY Watch GS',
  'Garmin Forerunner 55',
  'Relogio Technos Racer',
  'Relogio Orient automatico masculino'
];

const PERFUMES = [
  'La Vie Est Belle Lancome',
  '212 VIP Black Carolina Herrera',
  'Dior Sauvage Eau de Toilette',
  'Invictus Paco Rabanne',
  'Good Girl Carolina Herrera',
  'Yara Lattafa',
  'Club de Nuit Intense Man',
  'Egeo Bomb Black',
  'Libre Yves Saint Laurent',
  'My Way Giorgio Armani'
];

const BELEZA = [
  'Kit skincare Cerave hidratacao',
  'Protetor solar ISDIN Fusion Water',
  'Serum Principia niacinamida',
  'Serum Creamy retinol',
  'Chapinha Taiff Style',
  'Maquina de cortar Philips Multigroom',
  'Escova secadora Philco Soft Brush',
  'Base Maybelline Super Stay',
  'Secador Dyson Supersonic',
  'Mascara Elseve Glycolic Gloss'
];

const INFANTIL = [
  'Patinete infantil 3 rodas',
  'Bicicleta infantil aro 16',
  'Mochila escolar infantil rodinhas',
  'Lancheira termica infantil',
  'LEGO Classic caixa criativa',
  'Piscina inflavel Mor 1000 litros',
  'Fantasia infantil Stitch',
  'Mesa didatica infantil',
  'Cama montessoriana infantil',
  'Boneca Barbie Dreamtopia'
];

const BEBE = [
  'Fralda Pampers Premium Care',
  'Fralda Huggies Supreme Care',
  'Lenco umedecido Pampers 576 unidades',
  'Carrinho de bebe travel system',
  'Cadeirinha carro 0 a 36kg',
  'Baba eletronica com camera',
  'Bomba tira leite eletrica',
  'Esterilizador de mamadeiras a vapor',
  'Tapete de atividades bebe',
  'Cadeira de alimentacao bebe'
];

const PAPELARIA = [
  'Caneta Stabilo Boss kit pastel',
  'Marca texto CIS Lumini',
  'Lapis Faber-Castell 72 cores',
  'Caderno Tilibra espiral 10 materias',
  'Caneta gel Pentel EnerGel',
  'Planner permanente sem data',
  'Apontador eletrico com deposito',
  'Estojo escolar grande 100 pens',
  'Kit brush pen tons pastel',
  'Bloco adesivo Post-it gigante'
];

const ESCRITORIO = [
  'Cadeira escritorio ergonomica mesh',
  'Monitor portatil Arzopa 15.6',
  'Suporte notebook aluminio regulavel',
  'Mesa digitalizadora Wacom One',
  'Hub USB-C 8 em 1 Ugreen',
  'Impressora Brother laser HL-L2360DW',
  'Roteador mesh TP-Link Deco M4',
  'Nobreak SMS 1200VA',
  'Mesa regulavel de altura',
  'Teclado Logitech K380'
];

const DECORACAO = [
  'Lustre pendente moderno',
  'Fita LED RGBIC Govee',
  'Espelho decorativo redondo 80cm',
  'Painel ripado decorativo',
  'Luminaria de mesa LED',
  'Quadro decorativo minimalista',
  'Tapete sala felpudo 2x3',
  'Cortina blackout 2 folhas',
  'Puff bau decorativo',
  'Difusor de aromas ultrassonico'
];

const MOVEIS = [
  'Sofa retratil 4 lugares',
  'Guarda-roupa casal 6 portas',
  'Painel para TV ate 65',
  'Mesa de jantar 6 cadeiras',
  'Escrivaninha industrial 120cm',
  'Rack com painel suspenso',
  'Cama box bau casal',
  'Poltrona decorativa linho',
  'Sapateira banco estofada',
  'Closet modulado aberto'
];

const UTILIDADES = [
  'Copo termico Stanley Quencher',
  'Garrafa termica Zojirushi 1L',
  'Organizador multiuso transparente',
  'Escorredor de louca inox',
  'Mop spray FlashLimp',
  'Varal de chao dobravel',
  'Caixa organizadora com tampa',
  'Kit potes hermeticos 12 pecas',
  'Balanca de cozinha digital',
  'Porta temperos giratorio 16 potes'
];

const CELULARES = [
  'Moto G54 5G',
  'Moto G34 5G',
  'Galaxy A55 5G',
  'Galaxy M55 5G',
  'Redmi Note 13 5G',
  'POCO C75',
  'Realme 12x 5G',
  'Infinix Hot 40i',
  'iPhone 15 128GB',
  'POCO X6 Pro'
];

const TABLETS = [
  'iPad 10 geracao Wi-Fi',
  'iPad Air M2 11',
  'Galaxy Tab S9 FE',
  'Galaxy Tab A9+',
  'Redmi Pad SE 11',
  'Lenovo Tab P12',
  'Vaio TL10 tablet',
  'Galaxy Tab S6 Lite',
  'Xiaomi Pad 6',
  'Tablet Positivo Vision Tab 10'
];

const SMARTPHONES_PREMIUM = [
  'iPhone 16 128GB',
  'iPhone 16 Pro 256GB',
  'iPhone 16 Pro Max 256GB',
  'Galaxy S25 256GB',
  'Galaxy S25 Ultra 512GB',
  'Galaxy Z Flip6 256GB',
  'Galaxy Z Fold6 512GB',
  'Xiaomi 15 Ultra',
  'Motorola Razr 50 Ultra',
  'Asus ROG Phone 9'
];

const SMARTPHONES_INTERMEDIARIOS = [
  'Galaxy A36 5G',
  'Galaxy A56 5G',
  'Redmi Note 14 Pro 5G',
  'Redmi Note 14 Pro Plus',
  'POCO X7 Pro',
  'Moto Edge 50 Neo',
  'Moto Edge 50 Fusion',
  'Realme 12 Pro Plus',
  'Infinix Note 40 5G',
  'Nothing Phone 2a'
];

const AUDIO = [
  'JBL Go 4',
  'JBL PartyBox 110',
  'JBL Flip 6',
  'QCY HT07 ArcBuds',
  'Anker Soundcore Q30',
  'Edifier W820NB Plus',
  'Soundbar Samsung HW-B550',
  'Microfone Fifine A6V',
  'Sony WH-1000XM5',
  'AirPods 4'
];

const VIDEO = [
  'TV Samsung Crystal 50 4K',
  'TV LG OLED C4 55',
  'TV TCL 55 C655',
  'Smart monitor Samsung M8',
  'Projetor Wanbo Mozart 1',
  'Webcam Logitech Brio 4K',
  'Camera GoPro HERO13 Black',
  'TV Philips Ambilight 55',
  'Mini projetor HY300 Pro',
  'Camera de seguranca Imou Cruiser'
];

const STREAMING = [
  'Fire TV Cube',
  'Google TV Streamer 4K',
  'Roku Express 4K',
  'Xiaomi TV Box S 2nd Gen',
  'Elgato HD60 X',
  'Stream Deck Neo',
  'Cam Link 4K Elgato',
  'Ring light 18 polegadas',
  'Microfone Fifine K658',
  'Controle remoto air mouse'
];

const LIVROS = [
  'Habitos Atomicos',
  'A Psicologia Financeira',
  'Box Harry Potter',
  'Box ACOTAR',
  'Cafe com Deus Pai 2026',
  'O Homem Mais Rico da Babilonia',
  'A Sutil Arte de Ligar o Foda-se',
  'As Armas da Persuasao',
  'Box Percy Jackson',
  'Livro de colorir Bobbie Goods'
];

const BRINQUEDOS = [
  'LEGO Technic McLaren',
  'Hot Wheels ataque da cobra',
  'Boneca Barbie DreamHouse Adventures',
  'Nerf Elite 2.0 Commander',
  'Carrinho controle remoto 4x4',
  'Pista Hot Wheels City',
  'Jogo Uno minimalista',
  'Play-Doh sorveteria',
  'Fisher-Price Cachorrinho Aprender',
  'Quebra-cabeca 1000 pecas'
];

const CAMPING = [
  'Barraca Azteq Minipack',
  'Colchao inflavel casal Intex',
  'Lanterna tatica recarregavel',
  'Cadeira camping dobravel',
  'Caixa termica Coleman 28QT',
  'Fogareiro Nautika Frontier',
  'Mochila cargueira 50L',
  'Canivete Victorinox Huntsman',
  'Saco de dormir Coleman',
  'Garrafa Stanley Adventure 1.5L'
];

const PESCA = [
  'Carretilha Marine Sports Brisa',
  'Molinete Shimano Sienna 2500',
  'Vara de pesca carbono 1.80',
  'Linha multifilamento 8X 300m',
  'Caixa de pesca organizadora',
  'Kit iscas artificiais tucuna',
  'Alicate de pesca boga grip',
  'Sonar portatil Fish Finder',
  'Cadeira de pesca dobravel',
  'Viveiro para pesca esportiva'
];

const ESPORTE = [
  'Bola futsal Penalty Max 1000',
  'Camisa oficial Adidas futebol',
  'Chuteira Nike Phantom GX',
  'Bicicleta aro 29 Caloi Explorer',
  'Patins inline Oxer',
  'Raquete beach tennis Shark',
  'Prancha stand up inflavel',
  'Kimono jiu-jitsu trancado',
  'Luva boxe Everlast Pro Style',
  'Kit beach tennis carbono'
];

const JARDINAGEM = [
  'Aparador de grama Tramontina AP1500T',
  'Mangueira flex para jardim 30m',
  'Tesoura de poda Tramontina profissional',
  'Soprador de folhas a bateria',
  'Cortador de grama eletrico 1300W',
  'Vaso autoirrigavel grande',
  'Kit ferramentas jardinagem 3 pecas',
  'Mangueira expansivel 15m',
  'Serra de poda eletrica',
  'Pulverizador manual 5L'
];

const CATEGORY_QUERY_BLOCKS = {
  'Eletrônicos': ELETRONICOS,
  'Games': GAMES,
  'Hardware': HARDWARE,
  'Informática': INFORMATICA,
  'Casa Inteligente': CASA_INTELIGENTE,
  'Cozinha': COZINHA,
  'Eletrodomésticos': ELETRODOMESTICOS,
  'Eletroportáteis': ELETROPORTATEIS,
  'Ferramentas': FERRAMENTAS,
  'Automotivo': AUTOMOTIVO,
  'Pet': PET,
  'Saúde': SAUDE,
  'Fitness': FITNESS,
  'Suplementos': SUPLEMENTOS,
  'Moda Masculina': MODA_MASCULINA,
  'Moda Feminina': MODA_FEMININA,
  'Tênis': TENIS,
  'Relógios': RELOGIOS,
  'Perfumes': PERFUMES,
  'Beleza': BELEZA,
  'Infantil': INFANTIL,
  'Bebê': BEBE,
  'Papelaria': PAPELARIA,
  'Escritório': ESCRITORIO,
  'Decoração': DECORACAO,
  'Móveis': MOVEIS,
  'Utilidades': UTILIDADES,
  'Celulares': CELULARES,
  'Tablets': TABLETS,
  'Smartphones Premium': SMARTPHONES_PREMIUM,
  'Smartphones Intermediários': SMARTPHONES_INTERMEDIARIOS,
  'Áudio': AUDIO,
  'Vídeo': VIDEO,
  'Streaming': STREAMING,
  'Livros': LIVROS,
  'Brinquedos': BRINQUEDOS,
  'Camping': CAMPING,
  'Pesca': PESCA,
  'Esporte': ESPORTE,
  'Jardinagem': JARDINAGEM
};

const CATEGORY_MARKETPLACE_TARGETS = {
  'Eletrônicos': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Games': ['Amazon', 'Mercado Livre', 'Magalu'],
  'Hardware': ['Mercado Livre', 'Amazon', 'Magalu'],
  'Informática': ['Mercado Livre', 'Amazon', 'Magalu'],
  'Casa Inteligente': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Cozinha': ['Amazon', 'Magalu', 'Mercado Livre'],
  'Eletrodomésticos': ['Magalu', 'Mercado Livre', 'Amazon'],
  'Eletroportáteis': ['Amazon', 'Magalu', 'Mercado Livre'],
  'Ferramentas': ['Mercado Livre', 'Amazon', 'Shopee'],
  'Automotivo': ['Mercado Livre', 'Amazon', 'Shopee'],
  'Pet': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Saúde': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Fitness': ['Netshoes', 'Amazon', 'Mercado Livre'],
  'Suplementos': ['Netshoes', 'Amazon', 'Mercado Livre'],
  'Moda Masculina': ['Netshoes', 'Shopee', 'Shein'],
  'Moda Feminina': ['Shopee', 'Shein', 'Netshoes'],
  'Tênis': ['Netshoes', 'Mercado Livre', 'Amazon'],
  'Relógios': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Perfumes': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Beleza': ['Amazon', 'Shopee', 'Shein'],
  'Infantil': ['Shopee', 'Amazon', 'Mercado Livre'],
  'Bebê': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Papelaria': ['Amazon', 'Shopee', 'Mercado Livre'],
  'Escritório': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Decoração': ['Amazon', 'Shopee', 'Magalu'],
  'Móveis': ['Magalu', 'Mercado Livre', 'Amazon'],
  'Utilidades': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Celulares': ['Mercado Livre', 'Amazon', 'Magalu'],
  'Tablets': ['Amazon', 'Mercado Livre', 'Magalu'],
  'Smartphones Premium': ['Mercado Livre', 'Amazon', 'Magalu'],
  'Smartphones Intermediários': ['Mercado Livre', 'Amazon', 'Magalu'],
  'Áudio': ['Amazon', 'Mercado Livre', 'Magalu'],
  'Vídeo': ['Amazon', 'Mercado Livre', 'Magalu'],
  'Streaming': ['Amazon', 'Mercado Livre', 'Magalu'],
  'Livros': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Brinquedos': ['Amazon', 'Shopee', 'Mercado Livre'],
  'Camping': ['Amazon', 'Mercado Livre', 'Shopee'],
  'Pesca': ['Mercado Livre', 'Amazon', 'Shopee'],
  'Esporte': ['Netshoes', 'Amazon', 'Mercado Livre'],
  'Jardinagem': ['Mercado Livre', 'Amazon', 'Shopee']
};

function normalizeGoldenQuery(query) {
  return String(query || '').trim().replace(/\s+/g, ' ');
}

function dedupeQueryList(queries) {
  const seen = new Set();
  return queries.reduce((acc, rawQuery) => {
    const query = normalizeGoldenQuery(rawQuery);
    const key = query.toLowerCase();
    if (!query || seen.has(key)) return acc;
    seen.add(key);
    acc.push(query);
    return acc;
  }, []);
}

function buildCategoryQueryBank(queries) {
  const buckets = {
    popular: [],
    volume: [],
    brand: [],
    generic: [],
    promo: []
  };
  const bucketNames = Object.keys(buckets);
  dedupeQueryList(queries).forEach((query, index) => {
    buckets[bucketNames[index % bucketNames.length]].push(query);
  });
  return buckets;
}

function createEmptyGoldenQueries() {
  return MARKETPLACE_ORDER.reduce((acc, store) => {
    acc[store] = {};
    return acc;
  }, {});
}

function buildMarketplaceGoldenQueries() {
  const banks = createEmptyGoldenQueries();
  const marketplaceLoad = MARKETPLACE_ORDER.reduce((acc, store) => {
    acc[store] = 0;
    return acc;
  }, {});

  Object.entries(CATEGORY_QUERY_BLOCKS).forEach(([categoryName, rawQueries]) => {
    const targets = CATEGORY_MARKETPLACE_TARGETS[categoryName] || MARKETPLACE_ORDER;
    const queries = dedupeQueryList(rawQueries);
    const assignments = targets.reduce((acc, store) => {
      acc[store] = [];
      return acc;
    }, {});

    const seededTargets = [...targets]
      .sort((a, b) => marketplaceLoad[a] - marketplaceLoad[b])
      .slice(0, Math.min(targets.length, queries.length));

    queries.forEach((query, index) => {
      if (index < seededTargets.length) {
        const seededStore = seededTargets[index];
        assignments[seededStore].push(query);
        marketplaceLoad[seededStore] += 1;
        return;
      }

      const selectedStore = targets.reduce((bestStore, currentStore) => {
        if (!bestStore) return currentStore;

        const bestLoad = marketplaceLoad[bestStore];
        const currentLoad = marketplaceLoad[currentStore];
        if (currentLoad !== bestLoad) {
          return currentLoad < bestLoad ? currentStore : bestStore;
        }

        return assignments[currentStore].length < assignments[bestStore].length ? currentStore : bestStore;
      }, null);

      assignments[selectedStore].push(query);
      marketplaceLoad[selectedStore] += 1;
    });

    targets.forEach((store) => {
      if (assignments[store].length > 0) {
        banks[store][categoryName] = buildCategoryQueryBank(assignments[store]);
      }
    });
  });

  return banks;
}

const GOLDEN_QUERIES = buildMarketplaceGoldenQueries();

const QUERY_ROTATION_STATE = {};

function rotateList(items, offset = 0) {
  if (!items.length) return [];
  const shift = Math.abs(offset) % items.length;
  return items.slice(shift).concat(items.slice(0, shift));
}

// #region debug-point A:query-meta
function resolveQueryAuditMeta(store, query) {
  const normalizedQuery = normalizeGoldenQuery(query);
  const storeBank = GOLDEN_QUERIES[store] || {};

  for (const [categoryName, variants] of Object.entries(storeBank)) {
    for (const [variantName, queries] of Object.entries(variants)) {
      if ((queries || []).some((candidate) => normalizeGoldenQuery(candidate) === normalizedQuery)) {
        return { category: categoryName, variant: variantName };
      }
    }
  }

  return { category: 'Desconhecida', variant: 'unknown' };
}
// #endregion

function pickQueryFromCategory(categoryBank, variantOrder, usedQueries) {
  if (!categoryBank) return null;

  for (const variant of variantOrder) {
    const pool = categoryBank[variant] || [];
    for (const rawQuery of pool) {
      const query = normalizeGoldenQuery(rawQuery);
      if (query && !usedQueries.has(query)) {
        return query;
      }
    }
  }

  return null;
}

function getRandomQueries(store) {
  const categories = Object.keys(GOLDEN_QUERIES[store] || {});
  const settings = STORE_QUERY_SETTINGS[store] || { categoriesPerRun: 12, queriesPerCategory: 2 };
  const state = QUERY_ROTATION_STATE[store] || { categoryCursor: 0, variantCursor: 0 };
  QUERY_ROTATION_STATE[store] = state;

  if (categories.length === 0) {
    return ['oferta'];
  }

  const orderedCategories = rotateList(categories, state.categoryCursor);
  const selectedCategories = orderedCategories.slice(0, Math.min(settings.categoriesPerRun, categories.length));
  const usedQueries = new Set();
  const selected = [];

  selectedCategories.forEach((categoryName, index) => {
    const categoryBank = GOLDEN_QUERIES[store][categoryName];
    const primaryOrder = rotateList(QUERY_VARIANT_ORDER, state.variantCursor + index);
    const secondaryOrder = rotateList(QUERY_VARIANT_ORDER, state.variantCursor + index + 2);

    const firstQuery = pickQueryFromCategory(categoryBank, primaryOrder, usedQueries);
    if (firstQuery) {
      usedQueries.add(firstQuery);
      selected.push(firstQuery);
    }

    if ((settings.queriesPerCategory || 1) > 1) {
      const secondQuery = pickQueryFromCategory(categoryBank, secondaryOrder, usedQueries);
      if (secondQuery) {
        usedQueries.add(secondQuery);
        selected.push(secondQuery);
      }
    }
  });

  state.categoryCursor = (state.categoryCursor + selectedCategories.length) % categories.length;
  state.variantCursor = (state.variantCursor + 1) % QUERY_VARIANT_ORDER.length;

  // #region debug-point A:selected-queries
  const selectedCategorySet = new Set(selectedCategories);
  const dormantCategories = categories.filter((categoryName) => !selectedCategorySet.has(categoryName));
  emitAuditEvent('A', 'oracle-scraper.cjs:getRandomQueries', 'query-batch-selected', {
    store,
    totalCategoriesAvailable: categories.length,
    selectedCategories,
    dormantCategories,
    queriesSelected: selected.map((query) => ({ query, ...resolveQueryAuditMeta(store, query) })),
    settings,
    rotationState: { categoryCursor: state.categoryCursor, variantCursor: state.variantCursor }
  });
  // #endregion

  return selected;
}

// ─── Telemetria Global do Ciclo ─────────────────────────────────
const cycleMetrics = {
  produtos_encontrados: 0,
  produtos_enviados_llm: 0,
  produtos_retornados: 0,
  produtos_aprovados: 0,
  produtos_rejeitados: 0,
  totalTokens: 0, // Nome consistente com o resto do código
  reject_reasons: {},
  por_marketplace: {}
};

// ─── Extração via Crawlee + Groq ──────────────────────────────
async function crawleeExtract(url, limit, storeName) {
  let rawExtractedData = '';
  let evalResult = { text: '', found: 0, sent: 0 };
  const extractStartedAt = Date.now();
  const queryContext = {
    store: SCRAPER_AUDIT_STATE.currentStore || storeName,
    query: SCRAPER_AUDIT_STATE.currentQuery,
    category: SCRAPER_AUDIT_STATE.currentCategory,
    variant: SCRAPER_AUDIT_STATE.currentVariant
  };

  // Calcula maxProducts aqui (fora do page.evaluate, pois lá não tem acesso às variáveis Node.js)
  const providerConfig = PROVIDER_CONFIG[LLM_PROVIDER];
  const maxProducts = providerConfig?.productsToProcess || 15;
  
  const SCRAPFLY_KEYS = (process.env.SCRAPFLY_API_KEYS || "").split(",").map(k => k.trim()).filter(k => k);
  let proxyConfiguration;
  let targetUrl = url;
  
  const isLocal = process.platform === 'win32';

  // Usamos Scrapfly apenas se não for execução local (para evitar proxy de datacenter no IP residencial)
  if (!isLocal && storeName === 'Mercado Livre' && SCRAPFLY_KEYS.length > 0) {
    const key = SCRAPFLY_KEYS[Math.floor(Math.random() * SCRAPFLY_KEYS.length)];
    // Proxy Scrapfly: username = API_KEY, password = asp=true&country=br
    proxyConfiguration = new ProxyConfiguration({
      proxyUrls: [`http://${key}:asp=true&country=br@proxy.scrapfly.io:8080`]
    });
    console.log(`  [Scrapfly] Utilizando proxy na loja Mercado Livre`);
  }

  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 150,
    navigationTimeoutSecs: 120,
    maxRequestRetries: 3, // Retry failed requests up to 3 times
    autoscaledPoolOptions: {
      systemStatusOptions: {
        maxMemoryOverloadedRatio: 999,
        maxEventLoopOverloadedRatio: 999,
        maxCpuOverloadedRatio: 999,
        maxClientOverloadedRatio: 999
      }
    },
    browserPoolOptions: {
      useFingerprints: false, // Desativado para não conflitar com o stealthPlugin
    },
    launchContext: {
      useIncognitoPages: false, // Necessário para o stealthPlugin aplicar no contexto global
      launcher: chromium,
      launchOptions: {
        headless: true,
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--mute-audio'
        ]
      }
    },
    preNavigationHooks: [
      async ({ page }) => {
        page.setDefaultNavigationTimeout(150000);
        page.setDefaultTimeout(150000);
      }
    ],
    async requestHandler({ request, page, log }) {
      log.info(`[Crawlee] Raspando: ${request.url}`);
      
      // Bloqueia imagens, fontes e mídia para economizar RAM/CPU na VPS e evitar timeouts
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'font', 'media'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      // Engana proteções bot comuns injetando webdriver false
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      // Simulação de Comportamento Humano (Scroll e pausas randômicas)
      const scrollSteps = Math.floor(Math.random() * 5) + 3; // 3 a 7 scrolls
      for (let i = 0; i < scrollSteps; i++) {
        await page.mouse.wheel(0, Math.floor(Math.random() * 600) + 200);
        await page.waitForTimeout(Math.floor(Math.random() * 800) + 500);
      }
      await page.waitForTimeout(2000);

      if (!crawler.__imageDebugListenerAttached) {
        page.on('console', (msg) => {
          try {
            const text = msg.text();
            if (typeof text === 'string' && text.startsWith('IMAGE_DEBUG')) {
              console.log(text);
            }
          } catch {}
        });
        crawler.__imageDebugListenerAttached = true;
      }

      evalResult = await page.evaluate(({ maxProd, imageDebugCtx }) => {
        const items = Array.from(document.querySelectorAll('div[data-asin], div[data-component-type="s-search-result"], [data-testid="product-card"], .ui-search-layout__item, .poly-card'));
        let results = [];
        const IMAGE_DEBUG_LIMIT = 5;
        let imageDebugLogged = 0;

        const parseSrcsetUrls = (srcsetValue) => {
          if (!srcsetValue || typeof srcsetValue !== 'string') return [];
          return srcsetValue
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => part.split(/\s+/)[0])
            .filter(Boolean);
        };

        const collectCardImages = (cardEl) => {
          const imgs = Array.from(cardEl.querySelectorAll('img'));
          const out = [];
          const seen = new Set();

          const pushUrl = (url, origin, attrName) => {
            if (!url || typeof url !== 'string') return;
            const normalized = url.trim();
            if (!normalized) return;
            const key = `${origin}::${normalized}`;
            if (seen.has(key)) return;
            seen.add(key);
            if (origin === 'outro' && attrName) {
              out.push({ url: normalized, origin, attr: attrName });
            } else {
              out.push({ url: normalized, origin });
            }
          };

          for (const imgEl of imgs) {
            const src = imgEl.getAttribute('src');
            if (src) pushUrl(src, 'src');

            const srcset = imgEl.getAttribute('srcset');
            if (srcset) {
              for (const u of parseSrcsetUrls(srcset)) pushUrl(u, 'srcset');
            }

            const dataSrc = imgEl.getAttribute('data-src');
            if (dataSrc) pushUrl(dataSrc, 'data-src');

            const dataOriginal = imgEl.getAttribute('data-original');
            if (dataOriginal) pushUrl(dataOriginal, 'data-original');

            const dataLazy = imgEl.getAttribute('data-lazy') || imgEl.getAttribute('data-lazy-src');
            if (dataLazy) pushUrl(dataLazy, 'data-lazy');

            const dyn = imgEl.getAttribute('data-a-dynamic-image');
            if (dyn) {
              try {
                const parsed = JSON.parse(dyn);
                for (const k of Object.keys(parsed || {})) {
                  pushUrl(k, 'outro', 'data-a-dynamic-image');
                }
              } catch {}
            }
          }

          return out;
        };

        const extractCardTitle = (cardEl) => {
          const t =
            (cardEl.querySelector('h2 span') && cardEl.querySelector('h2 span').textContent) ||
            (cardEl.querySelector('.a-size-base-plus') && cardEl.querySelector('.a-size-base-plus').textContent) ||
            (cardEl.querySelector('.a-size-medium') && cardEl.querySelector('.a-size-medium').textContent) ||
            '';
          const cleaned = (t || '').trim();
          if (cleaned) return cleaned;
          const imgAlt = cardEl.querySelector('img') ? cardEl.querySelector('img').getAttribute('alt') : '';
          return (imgAlt || '').trim();
        };

        for (let el of items) {
          const text = el.innerText || '';
          if (text.includes('R$')) {
            const linkTag = el.tagName === 'A' ? el : el.querySelector('a');
            const imgTag = el.querySelector('img.s-image') || el.querySelector('img.ui-search-result-image__element') || el.querySelector('img[data-testid="image"]') || el.querySelector('img');
            const url = linkTag ? linkTag.href : '';
            let img = '';
            if (imgTag) {
              const dyn = imgTag.getAttribute('data-a-dynamic-image');
              if (dyn) {
                try { img = Object.keys(JSON.parse(dyn))[0]; } catch(e){}
              }
              if (!img) img = imgTag.getAttribute('data-src');
              if (!img) {
                const srcset = imgTag.getAttribute('srcset');
                if (srcset) img = srcset.split(' ')[0];
              }
              if (!img) img = imgTag.getAttribute('src');
              if (!img) img = imgTag.src || '';
              
              if (img.startsWith('data:image') || img.includes('base64') || img.includes('svg') || img.includes('placeholder')) {
                img = '';
              }
            }
            if (url) {
              if (imageDebugLogged < IMAGE_DEBUG_LIMIT) {
                const title = extractCardTitle(el);
                const imagesInCard = collectCardImages(el);
                console.log('IMAGE_DEBUG ' + JSON.stringify({
                  Marketplace: (imageDebugCtx && imageDebugCtx.marketplace) || '',
                  "Golden Query": (imageDebugCtx && imageDebugCtx.goldenQuery) || '',
                  "Título": title,
                  "Quantidade de imagens encontradas dentro do card": imagesInCard.length,
                  "Imagem atualmente escolhida pelo scraper": img || '',
                  "Lista completa das URLs de imagens encontradas no card": imagesInCard
                }));
                imageDebugLogged++;
              }
              results.push(`[TEXTO]: ${text.replace(/\n/g, ' ')} | [LINK]: ${url} | [IMG]: ${img}`);
            }
          }
        }
        const unique = [];
        const seen = new Set();
        for(let r of results) {
          const u = r.match(/\[LINK\]: (.*?)(?: \||$)/)?.[1];
          if(u && !seen.has(u)){ seen.add(u); unique.push(r); }
        }
        return { 
          text: unique.slice(0, maxProd).join('\n'), 
          found: items.length,
          valid: results.length,
          sent: Math.min(unique.length, maxProd),
          longestText: results.reduce((max, r) => Math.max(max, r.length), 0),
          avgText: results.length ? results.reduce((sum, r) => sum + r.length, 0) / results.length : 0
        };
      }, { maxProd: maxProducts, imageDebugCtx: { marketplace: storeName, goldenQuery: queryContext.query || '' } });
      console.log(`\n  [DIAGNÓSTICO ${storeName}] Seletores encontrados: ${evalResult.found} | Cards com preço: ${evalResult.valid} | Enviados: ${evalResult.sent} | Textos: (Max: ${evalResult.longestText}, Média: ${evalResult.avgText.toFixed(0)})`);
      console.log(`[${storeName}] Itens raspados (únicos): ${evalResult.sent} | RAW size: ${evalResult.text.length}`);
    }
  });

  try {
    await crawler.run([targetUrl]);
  } catch (err) {
    // #region debug-point B:crawlee-error
    emitAuditEvent('B', 'oracle-scraper.cjs:crawleeExtract', 'crawler-error', {
      ...queryContext,
      url: targetUrl,
      error: err.message,
      durationMs: Date.now() - extractStartedAt
    });
    // #endregion
    console.error(`  [Crawlee] Erro ao raspar ${storeName}: ${err.message}`);
    await logErrorToSupabase('Oracle-Scraper', 'Crawlee Extract', err, { storeName, url: targetUrl });
    return [];
  }

  rawExtractedData = evalResult.text;
  cycleMetrics.produtos_encontrados += evalResult.found;
  cycleMetrics.produtos_enviados_llm += evalResult.sent;
  if (!cycleMetrics.por_marketplace[storeName]) cycleMetrics.por_marketplace[storeName] = 0;

  // #region debug-point B:extract-summary
  emitAuditEvent('B', 'oracle-scraper.cjs:crawleeExtract', 'extract-summary', {
    ...queryContext,
    url: targetUrl,
    selectorsFound: evalResult.found,
    cardsWithPrice: evalResult.valid,
    productsSentToLlm: evalResult.sent,
    rawPayloadLength: rawExtractedData.length,
    durationMs: Date.now() - extractStartedAt
  });
  // #endregion

  if (!rawExtractedData) {
    // #region debug-point B:empty-extract
    emitAuditEvent('B', 'oracle-scraper.cjs:crawleeExtract', 'extract-empty', {
      ...queryContext,
      url: targetUrl
    });
    // #endregion
    return [];
  }
  if (!validateHtml(rawExtractedData, storeName)) {
    // #region debug-point B:html-rejected
    emitAuditEvent('B', 'oracle-scraper.cjs:crawleeExtract', 'html-validator-rejected', {
      ...queryContext,
      url: targetUrl,
      rawPayloadLength: rawExtractedData.length
    });
    // #endregion
    return [];
  }

  // Chama o LLM para formatar os dados
  console.log(`  [LLM] Analisando dados brutos da ${storeName}...`);
  if (storeName === "Amazon") console.log("RAW AMZ:", rawExtractedData.substring(0, 1000));
  const prompt = getScrapingPrompt(storeName);

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: rawExtractedData.substring(0, 4000) }
  ];

  try {
    const res = await callLLMWithFallback(messages, {
      temperature: 0.1,
      responseFormat: { type: "json_object" }
    });

    const content = res.choices[0].message.content;
    try {
      const cleanContent = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
      const data = JSON.parse(cleanContent);
      const returnedProducts = data.products || [];
      cycleMetrics.produtos_retornados += returnedProducts.length;
      const validationPreview = buildValidationPreview(returnedProducts, storeName);
      
      if (storeName === "Amazon") {
        console.log(`[Amazon] Output:`, JSON.stringify(returnedProducts, null, 2));
      }

      // #region debug-point C:validator-preview
      emitAuditEvent('C', 'oracle-scraper.cjs:crawleeExtract', 'validator-preview', {
        ...queryContext,
        returnedProducts: returnedProducts.length,
        previewApproved: validationPreview.approved,
        previewRejected: validationPreview.rejected,
        avgConfidence: validationPreview.avgConfidence,
        rejectStats: validationPreview.rejectStats,
        confidenceBuckets: validationPreview.confidenceBuckets,
        missingStats: validationPreview.missingStats
      });
      // #endregion
      
      const approvedProducts = sanitizeScrapedData(returnedProducts, storeName).slice(0, limit);
      
      console.log(`\n  [DIAGNÓSTICO ${storeName}] Retornados: ${returnedProducts.length} | Aprovados: ${approvedProducts.length} | Rejeitados: ${returnedProducts.length - approvedProducts.length}`);

      // #region debug-point C:validator-result
      emitAuditEvent('C', 'oracle-scraper.cjs:crawleeExtract', 'validator-result', {
        ...queryContext,
        returnedProducts: returnedProducts.length,
        approvedProducts: approvedProducts.length,
        rejectedProducts: returnedProducts.length - approvedProducts.length,
        limitApplied: limit
      });
      // #endregion
      
      cycleMetrics.produtos_aprovados += approvedProducts.length;
      cycleMetrics.produtos_rejeitados += (returnedProducts.length - approvedProducts.length);
      cycleMetrics.por_marketplace[storeName] += approvedProducts.length;
      
      return approvedProducts;
    } catch (parseErr) {
      // #region debug-point C:parse-error
      emitAuditEvent('C', 'oracle-scraper.cjs:crawleeExtract', 'llm-parse-error', {
        ...queryContext,
        error: parseErr.message
      });
      // #endregion
      console.error(`  [LLM] Erro de parse JSON no scraper: ${parseErr.message}`);
      return [];
    }
  } catch (err) {
    // #region debug-point C:llm-error
    emitAuditEvent('C', 'oracle-scraper.cjs:crawleeExtract', 'llm-formatting-error', {
      ...queryContext,
      error: err.message
    });
    // #endregion
    console.error(`  [LLM] Falha na formatação: ${err.message}`);
    return [];
  }
}

// ─── Normalização e Links de Afiliado ─────────────────────────
function cleanProductUrl(url) {
  if (!url) return null;
  try {
    const obj = new URL(url);
    obj.search = ''; 
    obj.hash = '';
    return obj.toString();
  } catch(e) {
    return url;
  }
}

function normalizeImageUrl(url) {
  if (!url || url === 'null') return null;
  // Rejeita imagens de anúncios patrocinados da Amazon (logo de marca, não produto)
  if (url.includes('/S/al-na') || url.includes('sponsored-ads.amazon') || url.includes('aax-us-east-retail')) return null;
  let u = url;
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.includes('mlcdn.com.br')) u = u.replace(/\/\d+x\d+\//, '/orig/');
  return u;
}

function buildAffiliateUrl(originalUrl, store) {
  try {
    const obj = new URL(originalUrl);
    if (store === 'Mercado Livre' && ML_AFFILIATE_ID) { obj.searchParams.set('dealerRef', ML_AFFILIATE_ID); return obj.toString(); }
    if (store === 'Amazon' && AMAZON_TAG) { obj.searchParams.set('tag', AMAZON_TAG); return obj.toString(); }
    if (store === 'Magalu' && MAGALU_PARTNER_ID) { obj.hostname = 'www.magazinevoce.com.br'; obj.pathname = `/${MAGALU_PARTNER_ID}${obj.pathname}`; return obj.toString(); }
    if (store === 'Netshoes' && RAKUTEN_AFFILIATE_ID) return `https://click.linksynergy.com/deeplink?id=${RAKUTEN_AFFILIATE_ID}&mid=${RAKUTEN_NETSHOES_MID}&murl=${encodeURIComponent(originalUrl)}`;
    if (store === 'Shopee' && SHOPEE_ADMITAD_ID) return `https://ad.admitad.com/g/${SHOPEE_ADMITAD_ID}/?ulp=${encodeURIComponent(originalUrl)}`;
  } catch (_) {}
  return originalUrl;
}

// ─── Sub-ID e Tracked URL ─────────────────────────────────────
function createSubId(channel, offerId) {
  const shortId = offerId.replace(/-/g, "").slice(0, 8);
  const prefixes = { telegram: "tg", instagram: "ig", whatsapp: "wp" };
  return `${prefixes[channel] || "x"}_${shortId}`;
}

function createTrackedUrl(subId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cacaoferta.com.br";
  return `${baseUrl}/go/${subId}`;
}

// ─── Score Matemático Frio ────────────────────────────────────
function calculateScoreV1(product) {
  const price = product.current_price || 0;
  const oldPrice = product.old_price || 0;
  
  let discountScore = 0;
  if (oldPrice > price) {
    const pct = (oldPrice - price) / oldPrice;
    
    // Bônus High-Ticket: Descontos em produtos caros valem MUITO mais
    if (price >= 1500 && pct >= 0.10) {
      discountScore = 10; // iPhone com 10% off é nota 10 em desconto
    } else if (pct >= 0.05 && pct <= 0.80) {
      discountScore = Math.min((pct / 0.5) * 10, 10);
    } else if (pct > 0.80) {
      discountScore = 2; // Penalidade de falso desconto (Black Fraude)
    }
  }

  // Preço Absoluto: Produtos abaixo de R$ 90 ganham nota máxima, independentemente de desconto
  let priceScore = price <= 90 ? 10 : (price <= 300 ? 8 : (price <= 700 ? 5 : 2));
  let impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 2));
  
  let ratingScore = product.rating ? (product.rating / 5) * 10 : 5;

  return Number(((discountScore * 0.35) + (priceScore * 0.30) + (impulseScore * 0.20) + (ratingScore * 0.15)).toFixed(2));
}

function calculateScoreV2(product) {
  const price = product.current_price || 0;
  const oldPrice = product.old_price || 0;
  
  let discountPct = 0;
  let absoluteSavings = 0;

  if (oldPrice > price) {
    discountPct = (oldPrice - price) / oldPrice;
    absoluteSavings = oldPrice - price;
  }
  
  let discountScore = 0;
  if (discountPct > 0) {
    if (discountPct > 0.8) discountScore = 2; // Black Fraude
    else discountScore = Math.min((discountPct / 0.5) * 10, 10);
  }
  
  // Economia Absoluta
  let savingsScore = absoluteSavings >= 1000 ? 10 : (absoluteSavings >= 500 ? 8 : (absoluteSavings >= 100 ? 5 : 0));
  
  // Compra por Impulso
  let impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 0));
  
  // Premium Score (compensa a falta de impulseScore para produtos caros)
  let premiumScore = price >= 1500 ? 8 : (price >= 700 ? 5 : 0);
  
  let ratingScore = product.rating ? (product.rating / 5) * 10 : 5;
  
  // A V2 pega o maior multiplicador comercial secundário
  const bestCommercialScore = Math.max(savingsScore, impulseScore, premiumScore);

  return Number(((discountScore * 0.40) + (bestCommercialScore * 0.45) + (ratingScore * 0.15)).toFixed(2));
}



// ─── Lógica IA: Copywriting via Groq ──────────────────────────
function cleanJsonString(str) {
  return str.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
}
async function generateOfferAnalysis(product, store) {
  // Verifica se temos pelo menos um provider configurado
  const hasCerebras = !!PROVIDER_CONFIG.cerebras.apiKey;
  const hasGroq = !!PROVIDER_CONFIG.groq.apiKey;
  
  if (!hasCerebras && !hasGroq) {
    console.warn(`  [LLM] Nenhum provider configurado. Usando fallback.`);
    return generateFallback(product, store);
  }
  
  const baseSystemPrompt = `Você é um Copywriter de ELITE especializado em marketing de afiliados de alta conversão. Respond in JSON.
Sua persona: Administrador eufórico de grupos de ofertas. Foco em escassez extrema e descontos.
Regras:
1. Ignore criação de links, injetaremos depois.
2. Coloque hashtags no array 'hashtags'.
3. Ignore preços monetários, injetaremos depois.
Formato: JSON com strategies[{headline, hook, body, cta, score}], hashtags[].`;

  const userPrompt = `Gerar copy para:
Nome: ${product.product_name}
Loja: ${store}

RETORNE EXATAMENTE NESTE FORMATO JSON:
{
  "strategies": [
    { "headline": "...", "hook": "...", "body": "...", "cta": "...", "score": 9.5 }
  ],
  "hashtags": ["#oferta"]
}`;

  const messages = [
    { role: "system", content: baseSystemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const data = await callLLMWithFallback(messages, {
      temperature: 0.7,
      maxTokens: 1000,
      responseFormat: { type: "json_object" }
    });

    let raw;
    try {
      raw = JSON.parse(cleanJsonString(data.choices[0].message.content));
    } catch (parseErr) {
      console.log(`  [LLM] JSON malformado. Usando fallback.`);
      return generateFallback(product, store);
    }
    const strategy = (raw.strategies && raw.strategies[0]) ? raw.strategies[0] : null;
    if (!strategy) {
      console.log(`  [LLM] Sem estratégia válida. Usando fallback.`);
      return generateFallback(product, store);
    }

    const hashtags = (raw.hashtags || ["#promocao"]).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');

    const pStr = product.current_price ? product.current_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    const opStr = product.old_price ? product.old_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    
    const priceBlock = opStr ? `de ${opStr}\n🔥 por ${pStr}` : `🔥 por ${pStr}`;
    const bottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store} 👇🏼\n🔗 {LINK}\n\n🚨 CHAMA seus amigos para receber promoções\nhttps://t.me/caca_ofertaoficial`;
    const instagramBottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store}\n\n🛍️ Quer garantir essa oferta?\n👉 Acesse a nossa **VITRINE** no link da BIO do perfil! Lá você encontra o link direto para comprar com segurança.\n\nCorre antes que esgote! 🏃‍♂️💨`;

    return {
      score: strategy.score || 8.0,
      telegram: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}\n\n${hashtags}`,
      instagram: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${instagramBottomBlock}\n\n${hashtags}`,
      whatsapp: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}`
    };
  } catch (err) {
    console.error(`  [LLM] Falha na geração de copy: ${err.message}. Usando fallback.`);
    return generateFallback(product, store);
  }
}

function generateFallback(product, store) {
  const pStr = product.current_price ? product.current_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const opStr = product.old_price ? product.old_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  
  const priceBlock = opStr ? `de ${opStr}\n🔥 por ${pStr}` : `🔥 por ${pStr}`;
  const bottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store || 'Especial'} 👇🏼\n🔗 {LINK}\n\n🚨 CHAMA seus amigos para receber promoções\nhttps://t.me/caca_ofertaoficial`;
  const instagramBottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store || 'Especial'}\n\n🛍️ Quer garantir essa oferta?\n👉 Acesse a nossa **VITRINE** no link da BIO do perfil! Lá você encontra o link direto para comprar com segurança.\n\nCorre antes que esgote! 🏃‍♂️💨`;

  return {
    score: 5.0,
    telegram: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}\n\n#oferta`,
    instagram: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${instagramBottomBlock}\n\n#oferta`,
    whatsapp: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}`
  };
}

// ─── Salva Oferta Básica (Rascunho) ───────────────────────────
async function upsertOffer(product, store, affiliateUrl) {
  const scoreV1 = calculateScoreV1(product);
  const scoreV2 = calculateScoreV2(product);
  
  // A V1 continua mandando no sistema principal
  const score = scoreV1;
  
  // Prepara explainability com os scores para armazenar
  const explainability = {
    score_v1: scoreV1,
    score_v2: scoreV2,
    timestamp: new Date().toISOString(),
    oracle_version: "2.0",
  };

  // A/B Test Telemetry
  if (process.env.SCORING_V2_ENABLED === 'true') {
    if (!cycleMetrics.ab_test_offers) cycleMetrics.ab_test_offers = [];
    cycleMetrics.ab_test_offers.push({
      product_name: product.product_name,
      store: store,
      score_v1: scoreV1,
      score_v2: scoreV2,
      diff: Number((scoreV2 - scoreV1).toFixed(2)),
      timestamp: new Date().toISOString()
    });
  }

  // #region debug-point D:score-calculated
  emitAuditEvent('D', 'oracle-scraper.cjs:upsertOffer', 'offer-scored', {
    store,
    query: SCRAPER_AUDIT_STATE.currentQuery,
    queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
    queryVariant: SCRAPER_AUDIT_STATE.currentVariant,
    productName: product.product_name,
    productCategory: product.category || 'Geral',
    currentPrice: product.current_price,
    oldPrice: product.old_price,
    rating: product.rating,
    hasImage: !!product.image_url,
    scoreV1,
    scoreV2,
    scoreChosen: score
  });
  // #endregion

  const { data: existing } = await supabase.from('offers').select('id, current_price, explainability').eq('original_url', affiliateUrl).eq('user_id', ADMIN_USER_ID).maybeSingle();

  if (existing) {
    // Merge explainability existente com os novos scores
    const newExplainability = { ...(existing.explainability || {}), ...explainability };

    if (Number(existing.current_price) !== product.current_price) {
      await supabase.from('offers').update({ 
        current_price: product.current_price, 
        old_price: product.old_price, 
        image_url: product.image_url, 
        score, 
        explainability: newExplainability,
        updated_at: new Date().toISOString() 
      }).eq('id', existing.id);
    } else {
      await supabase.from('offers').update({ 
        score, 
        explainability: newExplainability,
        updated_at: new Date().toISOString() 
      }).eq('id', existing.id);
    }

    // #region debug-point D:db-update
    emitAuditEvent('D', 'oracle-scraper.cjs:upsertOffer', 'offer-upserted-existing', {
      store,
      query: SCRAPER_AUDIT_STATE.currentQuery,
      queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
      productName: product.product_name,
      offerId: existing.id,
      score
    });
    // #endregion
    return { id: existing.id, isNew: false, score };
  }

  const { data, error } = await supabase.from('offers').insert({
    user_id: ADMIN_USER_ID, platform: store, product_name: product.product_name, original_url: affiliateUrl,
    image_url: product.image_url, current_price: product.current_price, old_price: product.old_price,
    rating: product.rating, category: product.category || 'Geral', score, status: 'draft',
    explainability: explainability,
    notes: `[Oracle In-House] Importado às ${new Date().toLocaleString('pt-BR')}`,
  }).select('id').single();

  if (error) {
    // #region debug-point D:db-error
    emitAuditEvent('D', 'oracle-scraper.cjs:upsertOffer', 'offer-insert-error', {
      store,
      query: SCRAPER_AUDIT_STATE.currentQuery,
      queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
      productName: product.product_name,
      error: error.message
    });
    // #endregion
    console.error(`  ✗ Erro insert: ${error.message}`);
    await logErrorToSupabase('Oracle-Scraper', 'Upsert Offer', error, { product, store, affiliateUrl });
    return null;
  }

  // #region debug-point D:db-insert
  emitAuditEvent('D', 'oracle-scraper.cjs:upsertOffer', 'offer-inserted-new', {
    store,
    query: SCRAPER_AUDIT_STATE.currentQuery,
    queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
    productName: product.product_name,
    offerId: data.id,
    score
  });
  // #endregion
  return { id: data.id, isNew: true, score };
}

// ─── Processamento Vip (IA, Links e Posts) ────────────────────
async function processTopOffers(candidates) {
  candidates.sort((a, b) => b.score - a.score);
  
  const uniqueStores = [...new Set(candidates.map(c => c.store))];
  const maxPerStore = uniqueStores.length > 0 ? Math.ceil(VIP_SLOTS / uniqueStores.length) : VIP_SLOTS;
  
  const storeCounts = {};
  let vipOffers = [];
  const leftovers = [];
  let belowThresholdCount = 0;
  
  for (const c of candidates) {
    if (c.score < APPROVAL_SCORE) {
      belowThresholdCount++;
      continue;
    }
    
    storeCounts[c.store] = (storeCounts[c.store] || 0) + 1;
    if (storeCounts[c.store] <= maxPerStore) {
      vipOffers.push(c);
    } else {
      leftovers.push(c);
    }
  }
  
  while (vipOffers.length < VIP_SLOTS && leftovers.length > 0) {
    vipOffers.push(leftovers.shift());
  }
  vipOffers = vipOffers.slice(0, VIP_SLOTS);

  // #region debug-point E:approval-pipeline
  emitAuditEvent('E', 'oracle-scraper.cjs:processTopOffers', 'approval-pipeline-summary', {
    totalCandidates: candidates.length,
    belowThresholdCount,
    selectedForAi: vipOffers.length,
    leftoverCount: leftovers.length,
    maxPerStore,
    uniqueStores
  });
  // #endregion

  if (vipOffers.length === 0) {
    console.log(`\n🤖 Nenhuma oferta atingiu o score mínimo (${APPROVAL_SCORE}) para IA nesta rodada.`);
    return 0;
  }

  console.log(`\n🤖 Iniciando processamento IA para as ${vipOffers.length} melhores ofertas...`);
  let processed = 0;

  for (const item of vipOffers) {
    console.log(`  [IA] Gerando copy para: ${item.product.product_name.substring(0, 40)}...`);
    const analysis = await generateOfferAnalysis(item.product, item.store);
    
    const finalScore = Number(((item.score * 0.7) + (analysis.score * 0.3)).toFixed(2));
    await supabase.from('posts').delete().eq('offer_id', item.id).eq('status', 'draft');

    const channels = ['telegram', 'instagram', 'whatsapp'];
    const linksMap = {};

    for (const channel of channels) {
      const subId = createSubId(channel, item.id);
      const trackedUrl = createTrackedUrl(subId);
      
      const { data: linkData } = await supabase.from('affiliate_links').upsert({
        user_id: ADMIN_USER_ID, offer_id: item.id, channel, original_url: item.affiliateUrl, tracked_url: trackedUrl, sub_id: subId
      }, { onConflict: 'offer_id,channel' }).select('id').single();

      linksMap[channel] = { id: linkData.id, url: trackedUrl };
    }

    const postsToInsert = [
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.telegram.id, channel: 'telegram', content: analysis.telegram.replace('{LINK}', linksMap.telegram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.instagram.id, channel: 'instagram', content: analysis.instagram.replace('{LINK}', linksMap.instagram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.whatsapp.id, channel: 'whatsapp', content: analysis.whatsapp.replace('{LINK}', linksMap.whatsapp.url), status: 'draft' }
    ];

    await supabase.from('posts').insert(postsToInsert);
    await supabase.from('offers').update({ status: 'approved', score: finalScore }).eq('id', item.id);

    // #region debug-point E:approved-offer
    emitAuditEvent('E', 'oracle-scraper.cjs:processTopOffers', 'offer-approved', {
      offerId: item.id,
      store: item.store,
      query: item.audit?.query || null,
      queryCategory: item.audit?.queryCategory || null,
      productName: item.product.product_name,
      originalScore: item.score,
      aiScore: analysis.score,
      finalScore
    });
    // #endregion

    processed++;
    await new Promise(r => setTimeout(r, 6000)); 
  }
  return processed;
}

// ─── Faxina ───────────────────────────────────────────────────
async function cleanupOldDrafts() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);
  const { data } = await supabase.from('offers').delete().eq('status', 'draft').lt('updated_at', cutoff.toISOString()).select('id');
  console.log(`[FAXINA] ${data?.length || 0} drafts antigos removidos.`);
}

// ─── Raspa Loja ───────────────────────────────────────────────
async function scrapeStore(store) {
  const queries = getRandomQueries(store); // Pega 1 keyword de CADA categoria da loja
  let storeCandidates = [];
  const storeStartedAt = Date.now();

  for (const query of queries) {
    try {
      const queryMeta = resolveQueryAuditMeta(store, query);
      SCRAPER_AUDIT_STATE.currentStore = store;
      SCRAPER_AUDIT_STATE.currentQuery = query;
      SCRAPER_AUDIT_STATE.currentCategory = queryMeta.category;
      SCRAPER_AUDIT_STATE.currentVariant = queryMeta.variant;
      SCRAPER_AUDIT_STATE.queryStartedAt = Date.now();
      let scoredProducts = 0;
      let newOffers = 0;
      let existingOffers = 0;
      let skippedMissingCore = 0;
      const queryScores = [];

      // #region debug-point B:query-start
      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'query-start', {
        store,
        query,
        queryCategory: queryMeta.category,
        queryVariant: queryMeta.variant
      });
      // #endregion

      console.log(`\n🔍 [${store}] Buscando: "${query}"...`);
      
      const urls = {
        'Mercado Livre': `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`,
        'Shopee': `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`,
        'Amazon': `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&rh=p_n_availability%3A2661601011`,
        'Shein': `https://br.shein.com/pdsearch/${encodeURIComponent(query)}/`,
        'Magalu': `https://www.magazineluiza.com.br/busca/${encodeURIComponent(query)}/`,
        'Netshoes': `https://www.netshoes.com.br/busca?nsCat=natural&q=${encodeURIComponent(query)}`
      };

      const rawProducts = await crawleeExtract(urls[store], OFFERS_PER_STORE, store);

      for (const p of rawProducts) {
        // A Groq retorna product_name e image_url, mas também suporta title/image para compatibilidade
        const productName = p.product_name || p.title;
        const productImage = p.image_url || p.image;
        const productPrice = p.current_price || p.price;
        const productOldPrice = p.old_price;
        
        if (!productName || !productPrice) {
          skippedMissingCore++;
          continue;
        }
        
        const rawUrl = p.url?.startsWith('http') ? p.url : urls[store];
        const affiliateUrl = buildAffiliateUrl(cleanProductUrl(rawUrl), store);
        
        const prodData = {
          product_name: productName, image_url: normalizeImageUrl(productImage || null),
          current_price: productPrice, old_price: productOldPrice && productOldPrice > productPrice ? productOldPrice : null,
          rating: p.rating ? parseFloat(String(p.rating)) : null, category: p.category || 'Geral'
        };

        const res = await upsertOffer(prodData, store, affiliateUrl);
        if (res) {
          scoredProducts++;
          queryScores.push(res.score);
          if (res.isNew) {
            newOffers++;
            storeCandidates.push({
              id: res.id,
              product: prodData,
              store,
              affiliateUrl,
              score: res.score,
              audit: {
                query,
                queryCategory: queryMeta.category,
                queryVariant: queryMeta.variant
              }
            });
          } else {
            existingOffers++;
          }
        }
      }

      // #region debug-point B:query-end
      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'query-end', {
        store,
        query,
        queryCategory: queryMeta.category,
        queryVariant: queryMeta.variant,
        approvedProductsFromValidator: rawProducts.length,
        scoredProducts,
        newOffers,
        existingOffers,
        skippedMissingCore,
        avgScore: averageNumbers(queryScores),
        durationMs: Date.now() - SCRAPER_AUDIT_STATE.queryStartedAt
      });
      // #endregion
      
      // Espera 5 segundos entre as buscas de categorias para aliviar o Groq TPM
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      // #region debug-point B:query-error
      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'query-error', {
        store,
        query,
        queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
        queryVariant: SCRAPER_AUDIT_STATE.currentVariant,
        error: err.message,
        durationMs: SCRAPER_AUDIT_STATE.queryStartedAt ? Date.now() - SCRAPER_AUDIT_STATE.queryStartedAt : 0
      });
      // #endregion
      console.error(`  [${store}] Erro na query "${query}": ${err.message}`);
      await logErrorToSupabase('Oracle-Scraper', 'Scrape Query', err, { store, query });
    }
  }
  
  // #region debug-point B:store-summary
  emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'store-summary', {
    store,
    queriesExecuted: queries.length,
    candidatesCollected: storeCandidates.length,
    durationMs: Date.now() - storeStartedAt
  });
  // #endregion

  console.log(`  ✅ [${store}] ${storeCandidates.length} ofertas coletadas das diversas categorias.`);
  return storeCandidates;
}

// ─── Error Logging Helper ─────────────────────────────────────
async function logErrorToSupabase(integration, action, error, metadata = {}) {
  try {
    await supabase.from('integration_logs').insert({
      user_id: ADMIN_USER_ID,
      integration,
      action,
      status: 'error',
      message: error.message || String(error),
      metadata: {
        ...metadata,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    });
  } catch (logErr) {
    console.error('Failed to log error to Supabase:', logErr.message);
  }
}

// ─── Heartbeat System ─────────────────────────────────────────
async function updateHeartbeat() {
  try {
    await supabase.from('integration_logs').insert({
      user_id: ADMIN_USER_ID, integration: 'Notebook-Heartbeat', action: 'Heartbeat Ping', status: 'success',
      message: `Notebook is alive at ${new Date().toISOString()}`,
      metadata: { last_seen: new Date().toISOString() }
    });
  } catch (e) {}
}

async function checkHeartbeat() {
  try {
    const { data } = await supabase.from('integration_logs')
      .select('created_at')
      .eq('integration', 'Notebook-Heartbeat')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data && data.created_at) {
      const lastSeen = new Date(data.created_at);
      const diffMins = (Date.now() - lastSeen.getTime()) / 1000 / 60;
      if (diffMins < 60) return true; // Online se visto na última 1 hora
    }
  } catch (e) {}
  return false;
}

// ─── Ciclo Principal ──────────────────────────────────────────
async function runScrapingCycle() {
  const startTime = Date.now();
  SCRAPER_AUDIT_STATE.cycleStartedAt = startTime;
  console.log(`\n${'═'.repeat(60)}\n🚀 ORACLE-SCRAPER IN-HOUSE — Início em ${new Date().toLocaleString('pt-BR')}\n${'═'.repeat(60)}`);

  const isWindows = process.platform === 'win32';
  const mode = process.env.SCRAPER_MODE || 'LOCAL';
  let allCandidates = [];
  let aiProcessed = 0;

  if (mode === 'LOCAL') {
    if (isWindows) {
      console.log(`\n[MODE: LOCAL] 💻 NOTEBOOK WINDOWS DETECTADO. Iniciando Scraping Local...`);
      await updateHeartbeat();
      const stores = ['Mercado Livre', 'Amazon', 'Shopee']; // Magalu desativada: bloqueio 403 consistente. Shopee ativa quando SHOPEE_ADMITAD_CAMPAIGN_ID preenchido
      
      for (const store of stores) {
        try {
          const candidates = await scrapeStore(store);
          allCandidates = allCandidates.concat(candidates);
        } catch (err) { console.error(`[SCRAPER][${store}] Erro: ${err.message}`); }
      }
      
      console.log(`\n✅ Scraping local concluído. ${allCandidates.length} ofertas raspadas neste ciclo.`);
      console.log(`\n📦 Buscando TODOS os drafts pendentes no Supabase para processar com IA...`);

      const { data: pendingDrafts, error: draftsError } = await supabase
        .from('offers')
        .select('*')
        .eq('status', 'draft')
        .eq('user_id', ADMIN_USER_ID);

      if (draftsError) {
        console.error(`[DRAFTS] Erro ao buscar drafts: ${draftsError.message}`);
      } else if (pendingDrafts && pendingDrafts.length > 0) {
        console.log(`\n🚀 ${pendingDrafts.length} drafts encontrados. Iniciando IA...`);
        const draftCandidates = pendingDrafts.map(d => ({
          id: d.id,
          product: {
            product_name: d.product_name,
            current_price: d.current_price,
            old_price: d.old_price,
            image_url: d.image_url,
            category: d.category || 'Geral',
            rating: d.rating
          },
          store: d.platform,
          affiliateUrl: d.original_url,
          score: d.score || 0
        }));
        aiProcessed = await processTopOffers(draftCandidates);
      } else {
        console.log(`\n📭 Nenhum draft pendente no Supabase.`);
      }
      await cleanupOldDrafts();
      
    } else {
      console.log(`\n[MODE: LOCAL] ☁️ ORACLE VPS DETECTADA. Atuando como Orquestrador / Leitor.`);
      const isOnline = await checkHeartbeat();
      if (!isOnline) {
         console.log(`\n⚠️ Scraping indisponível. Notebook offline há mais de 60 mins. Aguardando próximo ciclo.`);
         return; 
      }
      
      console.log(`\n📡 Notebook está online. Buscando novos DRAFTs no Supabase...`);
      const { data: drafts, error } = await supabase.from('offers')
        .select('*')
        .eq('status', 'draft')
        .eq('user_id', ADMIN_USER_ID);
        
      if (error) {
        console.error("Erro ao buscar drafts:", error.message);
      } else if (drafts && drafts.length > 0) {
         console.log(`\n📦 Encontrados ${drafts.length} drafts! Iniciando IA, Score Comercial e Publicação...`);
         
         // Remapeia para o formato que processTopOffers espera
         allCandidates = drafts.map(d => ({
           id: d.id,
           product: {
             product_name: d.product_name,
             current_price: d.current_price,
             old_price: d.old_price,
             image_url: d.image_url,
             category: d.category || 'Geral',
             rating: d.rating
           },
           store: d.platform,
           affiliateUrl: d.original_url,
           score: d.score || 0
         }));
         
         aiProcessed = await processTopOffers(allCandidates);
      } else {
         console.log(`\n📭 Nenhum draft novo no Supabase. Aguardando o Notebook enviar mais.`);
      }
      await cleanupOldDrafts();
    }
  } else if (mode === 'ORACLE' || mode === 'AUTO') {
    console.log(`\n[MODE: ${mode}] ⚠️ AVISO: Executando Scraping e Orquestração na mesma máquina (Uso para testes).`);
    const stores = isWindows ? ['Mercado Livre', 'Amazon', 'Shopee'] : ['Mercado Livre', 'Amazon', 'Shopee']; // Magalu desativada: bloqueio 403 consistente
    
    for (const store of stores) {
      try {
        const candidates = await scrapeStore(store);
        allCandidates = allCandidates.concat(candidates);
      } catch (err) { console.error(`[SCRAPER][${store}] Erro: ${err.message}`); }
    }

    aiProcessed = await processTopOffers(allCandidates);
    await cleanupOldDrafts();
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  
  const recoveryRate = cycleMetrics.produtos_encontrados > 0 ? (cycleMetrics.produtos_aprovados / cycleMetrics.produtos_encontrados).toFixed(2) : 0;
  const approvalRate = cycleMetrics.produtos_retornados > 0 ? (cycleMetrics.produtos_aprovados / cycleMetrics.produtos_retornados).toFixed(2) : 0;

  let abTestReport = null;
  if (process.env.SCORING_V2_ENABLED === 'true' && cycleMetrics.ab_test_offers) {
    const sortedByV1 = [...cycleMetrics.ab_test_offers].sort((a, b) => b.score_v1 - a.score_v1);
    const sortedByV2 = [...cycleMetrics.ab_test_offers].sort((a, b) => b.score_v2 - a.score_v2);
    
    // Calcula rank
    sortedByV1.forEach((o, i) => o.ranking_v1 = i + 1);
    const v2RankMap = new Map();
    sortedByV2.forEach((o, i) => v2RankMap.set(o.product_name, i + 1));
    
    abTestReport = sortedByV1.map(o => ({
      ...o,
      ranking_v2: v2RankMap.get(o.product_name)
    }));
  }

  try {
    await supabase.from('integration_logs').insert({
      user_id: ADMIN_USER_ID, integration: 'Oracle-Scraper', action: 'Ciclo In-House Completo', status: 'success',
      message: `${allCandidates.length} raspes, ${aiProcessed} via IA em ${duration}s.`,
      metadata: { 
        total_scraped: allCandidates.length, 
        ai_processed: aiProcessed, 
        duration_seconds: duration,
        produtos_encontrados: cycleMetrics.produtos_encontrados,
        produtos_enviados_llm: cycleMetrics.produtos_enviados_llm,
        produtos_retornados: cycleMetrics.produtos_retornados,
        produtos_aprovados: cycleMetrics.produtos_aprovados,
        produtos_rejeitados: cycleMetrics.produtos_rejeitados,
        recovery_rate: recoveryRate,
        approval_rate: approvalRate,
        consumo_tokens: cycleMetrics.totalTokens, // Corrigido
        por_marketplace: cycleMetrics.por_marketplace,
        ab_test_report: abTestReport
      }
    });
  } catch(e){}

  // #region debug-point E:cycle-summary
  emitAuditEvent('E', 'oracle-scraper.cjs:runScrapingCycle', 'cycle-summary', {
    mode,
    totalScrapedCandidates: allCandidates.length,
    aiProcessed,
    durationSeconds: duration,
    produtosEncontrados: cycleMetrics.produtos_encontrados,
    produtosEnviadosLlm: cycleMetrics.produtos_enviados_llm,
    produtosRetornados: cycleMetrics.produtos_retornados,
    produtosAprovados: cycleMetrics.produtos_aprovados,
    produtosRejeitados: cycleMetrics.produtos_rejeitados,
    totalTokens: cycleMetrics.totalTokens,
    porMarketplace: cycleMetrics.por_marketplace
  });
  // #endregion

  // Reset metrics for next cycle
  cycleMetrics.produtos_encontrados = 0;
  cycleMetrics.produtos_enviados_llm = 0;
  cycleMetrics.produtos_retornados = 0;
  cycleMetrics.produtos_aprovados = 0;
  cycleMetrics.produtos_rejeitados = 0;
  cycleMetrics.totalTokens = 0; // Corrigido
  cycleMetrics.por_marketplace = {};
  cycleMetrics.ab_test_offers = [];

  console.log(`\n🏁 Ciclo concluído em ${duration}s! IA gerou ${aiProcessed} posts. Próximo ciclo em 4h.\n`);
}

// ─── Inicialização ────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   ORACLE-SCRAPER IN-HOUSE (Crawlee)      ║');
console.log('╚══════════════════════════════════════════╝\n');

// Verifica se temos pelo menos um LLM provider configurado
const hasAtLeastOneLLM = !!PROVIDER_CONFIG.cerebras.apiKey || !!PROVIDER_CONFIG.groq.apiKey;

if (!hasAtLeastOneLLM || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("Missing required API keys (Supabase and at least one LLM provider: Cerebras or Groq)");
  process.exit(1);
}

runScrapingCycle().catch(e => console.error('❌ Erro no ciclo:', e.message));

cron.schedule(CRON_SCHEDULE, () => runScrapingCycle().catch(e => console.error('❌ Erro:', e.message)), {
  name: 'oracle-scraper-v2', timezone: 'America/Sao_Paulo', noOverlap: true
});
module.exports = { 
  crawleeExtract,
  cleanProductUrl,
  normalizeImageUrl,
  buildAffiliateUrl,
  calculateScoreV1,
  calculateScoreV2,
  generateFallback,
  getRandomQueries,
  scrapeStore,
  upsertOffer,
  processTopOffers,
  runScrapingCycle,
  logErrorToSupabase,
  GOLDEN_QUERIES
};
