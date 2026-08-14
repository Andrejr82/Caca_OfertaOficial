const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
  buildFallbackDubbingScript,
  buildDubbingPrompt,
  extractDubbingFacts,
  generateDubbingCopy,
  sanitizeDubbingScript,
} = require('../video-dubber.cjs');

const TITLES = {
  ferramenta: 'Parafusadeira Furadeira 48V impacto 3 funções Sem Fio 2 Baterias Com Maleta',
  moda: 'Kit 4 Camisetas Básicas Masculinas 100% Algodão',
  eletroportatil: 'Cafeteira Elétrica Compacta 15 Cafés',
};

test('fallback mantém identidade e fatos de três produtos diferentes', () => {
  const scripts = Object.values(TITLES).map((title) => buildFallbackDubbingScript(title, 15));

  assert.equal(new Set(scripts).size, scripts.length);
  assert.match(scripts[0], /parafusadeira|furadeira/iu);
  assert.match(scripts[0], /48|quarenta e oito|baterias|maleta/iu);
  assert.match(scripts[1], /kit.*camisetas/iu);
  assert.match(scripts[1], /quatro|algodão/iu);
  assert.match(scripts[2], /cafeteira/iu);
  assert.match(scripts[2], /compacta/iu);
});

test('título sem categoria conhecida não cai em texto universal', () => {
  const title = 'KIT 4 ou 2 Bermudas 2em1 Masculina Academia Corrida Fitness Compressão Treino Dr';
  const facts = extractDubbingFacts(title);
  const script = buildFallbackDubbingScript(title, 15);

  assert.notEqual(facts.key, 'produto');
  assert.match(script, /bermuda/iu);
  assert.doesNotMatch(script, /resolver uma tarefa do dia a dia|opção prática para essa tarefa/iu);
  assert.match(script, /Corre pra conferir!$/u);
});

test('sanitização preserva identidade válida e rejeita claim inventada', () => {
  const title = TITLES.eletroportatil;
  const valid = 'Olha essa cafeteira elétrica compacta. O modelo tem quinze cafés. Você encontra na Shopee. Corre pra conferir!';
  const unsafe = 'Olha essa cafeteira elétrica compacta. Ela é confortável e vai revolucionar sua rotina. Você encontra na Shopee. Corre pra conferir!';

  assert.equal(sanitizeDubbingScript(valid, title, 15), valid);
  assert.doesNotMatch(sanitizeDubbingScript(unsafe, title, 15), /confortável|revolucionar/iu);
});

test('geração passa contexto específico ao Groq e mantém resposta específica', async () => {
  const originalPost = axios.post;
  const previousKey = process.env.GROQ_API_KEY;
  let prompt = '';
  axios.post = async (_url, body) => {
    prompt = body.messages[0].content;
    return { data: { choices: [{ message: { content: 'Olha essa cafeteira elétrica compacta. O modelo tem quinze cafés. Você encontra na Shopee. Corre pra conferir!' } }] } };
  };
  process.env.GROQ_API_KEY = 'test-only';

  try {
    const script = await generateDubbingCopy(TITLES.eletroportatil, 'não usar', 15);
    assert.match(prompt, /Cafeteira Elétrica Compacta 15 Cafés/u);
    assert.match(script, /cafeteira|quinze cafés/iu);
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
  }
});
