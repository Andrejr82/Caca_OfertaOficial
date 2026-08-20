# Plano de Conversão Social — Copy V4

Data: 2026-08-20
Status: em execução
Objetivo: sair de zero vendas priorizando conversão real em redes sociais sem reabrir o Radar sem evidência.

## Princípios

- Verdade comercial acima de agressividade.
- Nenhuma urgência, estoque, cupom, frete, rating, vendas ou prova inventada.
- Uma ação principal por publicação.
- Provas reais devem ter prioridade: preço, economia em R$, desconto válido, bestseller, posição oficial, loja oficial/Mall, rating e vendas quando persistidos.
- Menos volume e mais ofertas-herói.
- Medir publicação -> clique -> compra.
- Não misturar mudanças de Radar nesta frente.
- Toda implementação deve permanecer documentada em `docs`.
- TDD, regressões, lint/typecheck/build antes do merge final.
- Vercel: acumular as tasks no mesmo programa e realizar um único deploy de produção no merge final; nunca fazer deploy manual para teste.
- Oracle: qualquer task que altere runtime/scripts Oracle exige prompt Gemini específico para execução pelo operador. Não executar Oracle automaticamente.

## Roadmap

### Task 1 — Copy V4: contrato de decisão de compra
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Contrato:
`Hook -> benefício/motivo -> prova -> oferta/economia -> CTA único`.

Ângulos comerciais:
- `proof`
- `saving`
- `price`
- `benefit`
- `standard`

Critérios:
- proof vence quando há evidência forte e verificável;
- saving usa apenas preço anterior válido;
- price favorece comunicação objetiva de ticket de impulso abaixo de R$100 quando não há prova/desconto melhor;
- benefit usa somente atributos sustentados pelos dados;
- standard é fallback seguro;
- CTA único por canal;
- sem falsa urgência.

Arquivos da Task 1:
- `src/core/ai/copy-v4.ts`
- `src/tests/core/ai/copy-v4.test.ts`

A ativação no fluxo canônico da Official AI será feita somente quando o programa estiver pronto para o merge final, para preservar a meta de um único deploy de produção.

### Task 2 — Seleção de ofertas-herói
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Objetivo: priorizar poucas ofertas com maior chance de clique/compra depois que a oportunidade já entrou no sistema. A Task 2 não substitui, rebaixa nem altera o Radar.

Classificações:
- `HERO`: prioridade máxima de exposição social;
- `TEST`: boa candidata para exploração controlada;
- `NORMAL`: oportunidade válida, sem prioridade especial;
- `SKIP_SOCIAL`: não deve entrar na fila social por falha básica de preço/link.

Sinais positivos auditáveis:
- preço de impulso abaixo de R$100;
- faixa de preço acessível até R$200;
- desconto verificável por preço anterior válido;
- economia absoluta em R$;
- bestseller / Mais Vendido;
- loja oficial / Mall;
- rating forte quando persistido;
- vendas do marketplace quando persistidas;
- produto de leitura social simples;
- novidade / ausência de exposição social recente.

Regras duras:
- ausência de comissão nunca elimina nem penaliza a oferta;
- comissão não participa do score da Task 2;
- link deve ser HTTPS válido;
- preço atual deve ser positivo;
- exposição recente é penalidade, não blacklist;
- no máximo 3 HERO por seleção por padrão;
- apenas um HERO por cluster semântico; duplicatas fortes são rebaixadas para `TEST`;
- quota cheia rebaixa HERO excedente para `TEST`, nunca rejeita a oferta;
- nenhuma classificação publica automaticamente.

Arquivos da Task 2:
- `src/lib/social/hero-selection.ts`
- `src/tests/lib/social/hero-selection.test.ts`

Fixture principal de regressão: Mochila Jiesipote do Mercado Livre por R$88, preço anterior R$269 e destaque BEST_SELLER Top #14 deve resultar em `HERO`, sem depender de comissão ou histórico interno.

A ativação no fluxo canônico social será feita somente no fechamento do programa, junto das regras específicas por canal, para preservar a meta de um único deploy de produção.

### Task 3 — WhatsApp Conversion
Status: PENDENTE.

Mensagem curta, prova/preço antes da dobra, um CTA e link direto.

### Task 4 — Instagram Stories + Reels
Status: PENDENTE.

Estrutura visual: hook em 0–2s, prova, preço/economia e ação única.

### Task 5 — Telegram Conversion
Status: PENDENTE.

Transformar post de catálogo em alerta comercial escaneável, factual e curto.

### Task 6 — Facebook Conversion
Status: PENDENTE.

Feed orientado a confiança/prova e CTA coerente com o primeiro comentário quando aplicável.

### Task 7 — Telemetria comercial
Status: PENDENTE.

Medir por oferta x canal: publicação, clique, CTR, compra/conversão, EPC e ausência de conversão.

### Task 8 — Experimentos A/B
Status: PENDENTE.

Testar ângulos de preço, economia, prova, benefício e oportunidade sem alterar fatos.

### Task 9 — Cadência e fadiga
Status: PENDENTE.

Evitar repetição excessiva, competição entre posts e saturação do mesmo produto/cluster.

### Task 10 — Aprendizado comercial
Status: PENDENTE.

Somente depois de volume de dados suficiente, usar resultados reais de canal/conversão para influenciar seleção e copy futuras.

## Critério de saída do programa

Antes do merge final:
- todas as tasks aprovadas;
- testes verdes;
- lint verde;
- typecheck verde;
- build verde;
- `git diff --check` equivalente limpo;
- revisão final de segurança factual;
- confirmar que nenhuma alteração exige Oracle não executada;
- um único merge em `main`;
- Vercel somente por auto-deploy do merge final.
