const fs = require('fs');
const path = require('path');

// Disable autorun before loading any oracle modules
process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';

// Load environment from .env.local without exposing secrets
function loadEnvSafe(filename) {
  const filepath = path.join(__dirname, '..', filename);
  if (fs.existsSync(filepath)) {
    const lines = fs.readFileSync(filepath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnvSafe('.env.local');
loadEnvSafe('.env');
loadEnvSafe('.env.local.remote');

const oracleScraper = require('./oracle-scraper.cjs');
const axios = require('axios');

async function runTests() {
  const originalPost = axios.post;
  let capturedUrl = null;
  let capturedData = null;

  axios.post = async (reqUrl, data, config) => {
    capturedUrl = reqUrl;
    capturedData = data;
    return { status: 200, data: { success: true, mocked: true } };
  };

  // Save original env variables to restore after tests
  const savedEnv = {
    OFFICIAL_AI_TRIGGER_URL: process.env.OFFICIAL_AI_TRIGGER_URL,
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    AUTH_URL: process.env.AUTH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    NODE_ENV: process.env.NODE_ENV,
  };

  function restoreEnv() {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  try {
    // Helper to clear all URL env vars
    function clearAllUrlVars() {
      delete process.env.OFFICIAL_AI_TRIGGER_URL;
      delete process.env.APP_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.PUBLIC_APP_URL;
      delete process.env.NEXTAUTH_URL;
      delete process.env.AUTH_URL;
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    }

    // 1. OFFICIAL_AI_TRIGGER_URL tem precedência como override.
    clearAllUrlVars();
    process.env.OFFICIAL_AI_TRIGGER_URL = 'https://override-domain.com/api/ai/generate';
    process.env.APP_URL = 'https://app-url.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://next-public-app-url.com';
    let res1 = oracleScraper.resolveOfficialAITriggerEndpoint();
    if (res1 !== 'https://override-domain.com/api/ai/generate') {
      throw new Error(`Test 1 Failed: Expected override URL, got ${res1}`);
    }

    // 2. APP_URL é reutilizada quando existe.
    clearAllUrlVars();
    process.env.APP_URL = 'https://app-url-domain.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://next-public-app-url.com';
    let res2 = oracleScraper.resolveOfficialAITriggerEndpoint();
    if (res2 !== 'https://app-url-domain.com/api/ai/generate') {
      throw new Error(`Test 2 Failed: Expected APP_URL to be reused, got ${res2}`);
    }

    // 3. NEXT_PUBLIC_APP_URL é reutilizada quando APP_URL não existe.
    clearAllUrlVars();
    process.env.NEXT_PUBLIC_APP_URL = 'https://next-public-domain.com';
    let res3 = oracleScraper.resolveOfficialAITriggerEndpoint();
    if (res3 !== 'https://next-public-domain.com/api/ai/generate') {
      throw new Error(`Test 3 Failed: Expected NEXT_PUBLIC_APP_URL to be reused, got ${res3}`);
    }

    // 4. A rota /api/ai/generate é anexada corretamente.
    clearAllUrlVars();
    process.env.APP_URL = 'https://my-clean-domain.com';
    let res4 = oracleScraper.resolveOfficialAITriggerEndpoint();
    if (res4 !== 'https://my-clean-domain.com/api/ai/generate') {
      throw new Error(`Test 4 Failed: Expected /api/ai/generate appended cleanly, got ${res4}`);
    }

    // 5. Uma barra final não gera //api.
    clearAllUrlVars();
    process.env.APP_URL = 'https://domain-with-trailing-slash.com///';
    let res5 = oracleScraper.resolveOfficialAITriggerEndpoint();
    if (res5 !== 'https://domain-with-trailing-slash.com/api/ai/generate') {
      throw new Error(`Test 5 Failed: Trailing slash generated double slash: ${res5}`);
    }

    // 6. Em produção sem URL, ocorre erro claro.
    clearAllUrlVars();
    process.env.NODE_ENV = 'production';
    let threwProdError = false;
    try {
      oracleScraper.resolveOfficialAITriggerEndpoint();
    } catch (err) {
      if (err.message.includes('URL pública da aplicação não configurada para o disparo da Official AI')) {
        threwProdError = true;
      } else {
        throw err;
      }
    }
    if (!threwProdError) {
      throw new Error('Test 6 Failed: Did not throw expected error when variable is absent in production');
    }

    // 7. Em desenvolvimento sem URL, localhost continua permitido.
    clearAllUrlVars();
    process.env.NODE_ENV = 'development';
    let res7 = oracleScraper.resolveOfficialAITriggerEndpoint();
    if (res7 !== 'http://127.0.0.1:3000/api/ai/generate') {
      throw new Error(`Test 7 Failed: Expected localhost in development without URL, got ${res7}`);
    }

    // 8. Nenhuma requisição real é enviada (Comprovar via mock em notifyWorkPendingToOfficialAI).
    restoreEnv();
    await oracleScraper.notifyWorkPendingToOfficialAI({ correlationId: 'test-correlation-8' });
    const expectedCanonicalEndpoint = oracleScraper.resolveOfficialAITriggerEndpoint();
    if (capturedUrl !== expectedCanonicalEndpoint) {
      throw new Error(`Test 8 Failed: Expected mock call to ${expectedCanonicalEndpoint}, but got ${capturedUrl}`);
    }
    if (capturedData?.offerId !== 'ALL_PENDING') {
      throw new Error(`Test 8 Failed: Expected offerId ALL_PENDING, but got ${capturedData?.offerId}`);
    }

    console.log('[Test] All 8 targeted surgical assertions passed successfully without real requests.');
  } finally {
    axios.post = originalPost;
    restoreEnv();
  }
}

runTests().catch((err) => {
  console.error('[Test Failed] ' + err.message);
  process.exit(1);
});
