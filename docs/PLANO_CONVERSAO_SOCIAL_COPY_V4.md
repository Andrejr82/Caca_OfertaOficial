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
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Objetivo: transformar a Copy V4 em mensagem de alta intenção para WhatsApp, curta e diretamente acionável.

Ordem de decisão:
`Hook -> prova -> preço/economia -> benefício -> condição factual -> CTA + link rastreado`.

Regras:
- prova e preço aparecem antes de contexto secundário quando existirem;
- máximo de 6 blocos;
- sem hashtags;
- sem linha burocrática de marketplace;
- sem “Veja a oferta”, “link abaixo” ou CTA genérico;
- exatamente uma CTA: `Conferir o preço atual`;
- exatamente um link rastreado HTTPS;
- link é recebido já resolvido pela camada de persistência, sem placeholder;
- URL inválida ou não HTTPS falha fechado;
- frete só aparece quando `freeShipping === true`;
- nenhuma urgência ou escassez sem evidência;
- nenhuma publicação automática.

Arquivos da Task 3:
- `src/lib/social/whatsapp-conversion.ts`
- `src/tests/lib/social/whatsapp-conversion.test.ts`

Fixture principal: Mochila Jiesipote deve exibir Top #14 antes do preço, preço antes do benefício, uma única CTA e um único link rastreado.

A integração com `SupabaseOfficialAIAdapter/materializeDraftContent` ficará para o fechamento do programa. O renderer final já aceita o tracked URL e é compatível com a regra existente de não duplicar uma URL rastreada válida.

### Task 4 — Instagram Stories + Reels
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Objetivo: transformar uma oferta HERO/TEST em plano visual curto e factual para descoberta + fechamento no Instagram, sem misturar duas rotas de ação.

Stories V4 — 3 telas:
1. `hook`: interrupção imediata;
2. `proof_offer`: prova verificável + preço/economia;
3. `action`: CTA única `Conferir o preço atual` com sticker de link rastreado HTTPS.

Reels V4 — 13 segundos:
- `0–2s`: hook;
- `2–6s`: prova ou benefício factual;
- `6–10s`: preço/economia;
- `10–13s`: CTA única para conferir o preço nos Stories.

Regras:
- URL rastreada existe apenas no destino da última tela de Stories;
- Reel não recebe URL direta no texto;
- sem hashtags no roteiro estrutural;
- sem “link na bio ou nos Stories” com duas rotas concorrentes;
- bestseller/posição só aparecem quando persistidos;
- sem prova social: usar benefício factual; se também faltar, fallback seguro;
- sem urgência, escassez ou prazo inventados;
- destino de Story inválido ou não HTTPS falha fechado;
- nenhuma publicação automática;
- não toca Remotion/renderização de vídeo nesta Task: aqui o contrato visual é definido e testado; integração audiovisual fica para o fechamento apropriado do programa.

Arquivos da Task 4:
- `src/lib/social/instagram-conversion.ts`
- `src/tests/lib/social/instagram-conversion.test.ts`

Fixture principal: Mochila Jiesipote deve colocar Top #14 e R$88 na segunda tela de Stories; Reel deve apresentar hook em 0–2s, prova antes do preço e terminar em uma ação única sem URL direta.

### Task 5 — Telegram Conversion
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Objetivo: substituir o formato de catálogo por um alerta comercial curto e escaneável, adequado a um canal de alta intenção.

Ordem de decisão:
`Hook -> prova -> preço/economia -> benefício -> condição factual -> CTA + link rastreado`.

Regras:
- prova e preço aparecem antes de benefício/contexto secundário quando existirem;
- máximo de 6 blocos;
- sem hashtags;
- sem linha burocrática de marketplace;
- sem “Veja a oferta”, “link abaixo” ou CTA genérico;
- exatamente uma CTA: `Conferir o preço atual`;
- exatamente um link rastreado HTTPS;
- frete aparece apenas quando `freeShipping === true`;
- sem urgência, estoque ou prazo inventados;
- sem prova social quando não houver evidência persistida;
- URL inválida ou não HTTPS falha fechado;
- nenhuma publicação automática.

Arquivos da Task 5:
- `src/lib/social/telegram-conversion.ts`
- `src/tests/lib/social/telegram-conversion.test.ts`

Fixture principal: Mochila Jiesipote deve exibir Top #14 antes de R$88, depois benefício factual, terminando com um único CTA e um único tracked URL.

A integração com a persistência/publicação canônica ficará para o fechamento do programa, junto da ativação da Copy V4, para preservar um único deploy de produção.

### Task 6 — Facebook Conversion
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Objetivo: usar o feed para confiança/prova e manter o tracked URL exclusivamente no primeiro comentário, com uma única rota de ação.

Contrato:
- `feed`: hook -> prova -> preço/economia -> benefício -> condição factual -> CTA para primeiro comentário;
- `firstComment`: uma única CTA `Conferir o preço atual` + tracked URL HTTPS.

Regras:
- feed não contém URL direta;
- primeiro comentário contém exatamente um tracked URL;
- prova e preço aparecem cedo;
- máximo de 6 blocos no feed;
- sem “Veja a oferta”, “link na bio” ou “link abaixo”;
- sem urgência, estoque ou prazo inventados;
- frete só aparece quando `freeShipping === true`;
- sem prova social quando não houver evidência persistida;
- URL inválida ou não HTTPS falha fechado;
- nenhuma publicação automática.

Arquivos da Task 6:
- `src/lib/social/facebook-conversion.ts`
- `src/tests/lib/social/facebook-conversion.test.ts`

Fixture principal: Mochila Jiesipote deve exibir Top #14 antes de R$88 no feed, orientar uma única vez para o primeiro comentário e manter o tracked URL exclusivamente nesse comentário.

A integração com a persistência/publicação canônica do Facebook ficará para o fechamento do programa; a Task 6 apenas define e testa o contrato correto, sem alterar produção nesta etapa.

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
