const https = require('https');

const keys = [
  { name: 'Chave 1 (Principal)', token: 'process.env.GROQ_API_KEY_1' },
  { name: 'Chave 2 (Alternativa)', token: 'process.env.GROQ_API_KEY_2' }
];

const models = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];

async function checkLimits(key, model) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 10
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key.token}`
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      
      res.on('end', () => {
        const headers = res.headers;
        let limits = {
          model: model,
          status: res.statusCode,
          requests_remaining: headers['x-ratelimit-remaining-requests'],
          requests_limit: headers['x-ratelimit-limit-requests'],
          tokens_remaining: headers['x-ratelimit-remaining-tokens'],
          tokens_limit: headers['x-ratelimit-limit-tokens'],
          reset_tokens: headers['x-ratelimit-reset-tokens']
        };

        if (res.statusCode === 429) {
          try {
            const body = JSON.parse(responseBody);
            limits.error = body.error.message;
          } catch(e) {}
        }
        resolve(limits);
      });
    });

    req.on('error', (e) => {
      resolve({ model, error: e.message });
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("🔍 Verificando limites das chaves Groq...\n");
  for (const key of keys) {
    console.log(`=================================================`);
    console.log(`🔑 ${key.name}`);
    console.log(`=================================================`);
    
    for (const model of models) {
      console.log(`Testando modelo: ${model}...`);
      const limits = await checkLimits(key, model);
      
      if (limits.status === 200) {
        console.log(`   ✅ Status: OK (Ativa)`);
        console.log(`   📊 Tokens Restantes (Hoje/Minuto): ${limits.tokens_remaining} de ${limits.tokens_limit}`);
        console.log(`   🔄 Requisições Restantes: ${limits.requests_remaining} de ${limits.requests_limit}`);
        console.log(`   ⏳ Tempo para Reset: ${limits.reset_tokens}`);
      } else if (limits.status === 429) {
        console.log(`   ❌ Status: 429 (BLOQUEADA POR RATE LIMIT)`);
        console.log(`   ⚠️ Detalhe: ${limits.error}`);
      } else {
        console.log(`   ❌ Erro HTTP: ${limits.status}`);
        if (limits.error) console.log(`   ⚠️ Detalhe: ${limits.error}`);
      }
      console.log('-------------------------------------------------');
      // Espera 2s para não tomar rate limit de conexões consecutivas
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log("\n");
  }
}

run();
