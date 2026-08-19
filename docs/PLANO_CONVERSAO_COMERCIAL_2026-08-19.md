# Plano de Conversão Comercial — 2026-08-19

## Objetivo

Transformar o volume atual de publicações e cliques do Caça Ofertas Oficial em vendas e comissão real, sem criar arquitetura paralela, sem experimentos longos e sem otimizações cosméticas que não possam ser medidas.

A prioridade desta frente é responder de forma objetiva:

1. quantos cliques atuais representam pessoas com intenção real;
2. onde o funil quebra entre postagem, clique, visita e compra;
3. quais produtos, canais, copies e criativos merecem escala;
4. quais alterações mínimas aumentam probabilidade de venda.

## Contexto já confirmado

- O sistema já publica em Facebook, WhatsApp, Telegram e Instagram.
- Há milhares de eventos de clique registrados, mas apenas uma venda Shopee persistida e sem atribuição completa a post/oferta/canal.
- A maior parte dos cliques registrados está concentrada no Facebook e em desktop, o que exige separar tráfego humano de previews/crawlers/bots antes de concluir que existe intenção comercial real.
- WhatsApp, Telegram e Instagram possuem volume de cliques muito inferior ao Facebook.
- O conteúdo histórico é majoritariamente informativo: produto + marketplace + preço + CTA + hashtags, com pouco benefício, prova, urgência comercial ou razão clara para comprar agora.
- O projeto já possui Radar/Tendências IA funcional para curadoria de oportunidades; ele não será reaberto nesta frente.

## Princípios obrigatórios

- Conversão comercial acima de volume de postagem.
- Nenhum campo factual de marketplace será inventado.
- Monetização/link correto e conversão comercial são problemas diferentes e serão medidos separadamente.
- Não criar cota artificial de marketplace, canal ou produto.
- Não alterar Oracle diretamente fora do procedimento já adotado; qualquer mudança operacional Oracle será executada via prompt específico para Gemini.
- Minimizar deploys Vercel; alterações serão consolidadas quando possível.
- Documentation Audit permanece fora de escopo.
- Toda task só fecha quando o comportamento estiver funcionando e validado no fluxo real aplicável.

## Funil comercial que será medido

Post publicado
→ impressão/visualização quando disponível
→ clique bruto
→ clique humano provável
→ visita válida ao destino
→ intenção/engajamento pós-clique quando observável
→ compra
→ comissão

O principal erro a evitar é tratar clique bruto como intenção de compra.

## Plano de Tasks

### Task 1 — Qualificar tráfego real e separar clique humano de clique técnico

**Objetivo:** descobrir quanto do tráfego registrado representa pessoas reais com chance de compra e quanto é preview, crawler, bot ou navegação técnica.

**Escopo:**
- analisar `click_events` e dados relacionados;
- segmentar por canal, source/referrer, device, user-agent quando disponível, IP/hash quando disponível, horário e padrão de repetição;
- identificar assinaturas de Facebook/Meta preview e outros crawlers;
- classificar os eventos em grupos como `human_likely`, `technical_likely` e `unknown` sem apagar dados históricos;
- medir cliques únicos prováveis por oferta e canal;
- identificar ofertas com clique humano provável e zero venda.

**Saída obrigatória:**
- número e percentual de cliques humanos prováveis por canal;
- número e percentual de cliques técnicos prováveis;
- top ofertas por clique humano provável;
- top ofertas com maior discrepância entre clique bruto e clique humano;
- conclusão objetiva sobre se o problema principal está antes ou depois do clique humano.

**Critério de aceite:** conseguir responder com evidência: “temos X cliques brutos, Y cliques humanos prováveis e Z ofertas com intenção real sem conversão”.

**Tempo alvo:** 30–45 minutos de investigação, sem alteração de arquitetura.

#### Resultado — Task 1 concluída em 2026-08-19

A tabela `click_events` possui apenas `source`, `device_type` e `created_at`; não há user-agent nem IP/hash persistidos. Por isso a classificação foi deliberadamente conservadora e não afirma que todo tráfego ambíguo seja humano ou bot.

**Volume observado:**
- 5.886 cliques brutos ligados a `affiliate_links`;
- Facebook: 5.809 cliques em 282 ofertas;
- WhatsApp: 56 cliques em 46 ofertas;
- Instagram: 13 cliques em 13 ofertas;
- Telegram: 8 cliques em 8 ofertas.

**Heurística aplicada para esta análise:**
- `technical_probable`: burst no mesmo minuto/source/device alcançando pelo menos 5 ofertas distintas;
- `human_probable`: WhatsApp/Telegram; Facebook mobile vindo de `m.facebook.com`/link-shim equivalente quando fora de burst; Instagram direto quando fora de burst;
- demais eventos: `ambiguous`.

**Resultado conservador:**
- 852 cliques `human_probable` (14,5% do total), distribuídos por 189 ofertas;
- 677 cliques `technical_probable` (11,5%);
- 4.357 cliques `ambiguous` (74,0%), quase integralmente Facebook desktop;
- todas as 189 ofertas com ao menos um clique humano provável continuam sem venda atribuída por `offer_id`.

**Por canal:**
- Facebook: 787 `human_probable`, 665 `technical_probable`, 4.357 `ambiguous`;
- WhatsApp: 56 `human_probable`;
- Telegram: 8 `human_probable`;
- Instagram: 1 `human_probable` e 12 `technical_probable` em um burst de 12 ofertas no mesmo minuto.

**Sinal técnico relevante:** o grupo `source=facebook + desktop` sozinho soma 4.491 cliques. Em 17 minutos ocorreram bursts com 5 ou mais ofertas distintas e 655 cliques dentro desses bursts, chegando a 78 cliques e 11 ofertas em um único minuto. Isso é incompatível com usar o contador bruto como proxy de intenção comercial e é compatível com tráfego técnico/preview automatizado, embora o banco atual não permita identificar cada agente com certeza.

**Ofertas com maior `human_probable` nesta leitura:**
- Máquina de Cortar Cabelo Dragão — Shopee — R$ 19,98 — 22 `human_probable` / 51 totais;
- Capacete Coquinho BR101 — Mercado Livre — R$ 196,52 — 18 / 47;
- Console Portátil Retrô 400 Jogos — Shopee — R$ 36,90 — 18 / 39;
- Tênis Casuais Femininos — Shein — R$ 149,21 — 18 / 31;
- Meias Unissex — Shein — R$ 13,52 — 17 / 27;
- Lava e Seca Samsung WD11A — Mercado Livre — R$ 3.905,07 — 16 / 33.

**Conclusão da Task 1:** o funil tem dois problemas diferentes. Primeiro, o contador bruto está fortemente contaminado por tráfego Facebook desktop/ambíguo e por bursts técnicos, portanto “milhares de cliques” não equivalem a milhares de compradores. Segundo, mesmo usando apenas o subconjunto conservador de 852 cliques humanos prováveis, há 189 ofertas com sinal de intenção e nenhuma venda atribuída. Logo, o problema comercial não termina na medição: existe evidência suficiente de quebra também **depois do clique humano provável**. A próxima task deve avaliar produto, preço e qualidade dessas ofertas antes de alterar tracking ou criar infraestrutura nova.

**Status:** CONCLUÍDA.

---

### Task 2 — Diagnosticar produto, preço e qualidade da oferta

**Objetivo:** identificar se estamos promovendo produtos com baixa probabilidade de compra mesmo quando há tráfego humano.

**Escopo:**
- cruzar cliques humanos prováveis com produto, marketplace, preço, desconto, rating, vendas/demanda observada, comissão quando disponível, recência e categoria;
- separar produtos de impulso, utilidade/demonstração, ticket alto e baixa confiança;
- comparar ofertas clicadas versus oportunidades atualmente aprovadas pelo Radar e ciclos Oracle;
- excluir produtos sem evidência suficiente ou com proposta comercial fraca.

**Saída obrigatória:** ranking de 5–10 ofertas para teste comercial controlado, com justificativa factual curta para cada uma.

**Critério de aceite:** nenhuma oferta entra no teste apenas por ter muitos cliques brutos.

**Tempo alvo:** 30–45 minutos.

#### Resultado — Task 2 concluída em 2026-08-19

O histórico clicado mostrou interesse humano provável, mas grande parte das ofertas antigas não possui no registro persistido evidência suficiente de vendas, rating ou comissão. Exemplos: Capacete Coquinho BR101 (18 cliques humanos prováveis) tinha preço R$ 196,52 e desconto de 13,4%, porém sem rating, vendas ou comissão observados no registro; Lava e Seca Samsung (16 cliques humanos prováveis) tinha ticket de R$ 3.905,07 e também sem evidência comercial persistida. Esses produtos não entram no teste apenas por terem recebido cliques.

O sinal histórico mais útil foi por **tipo de intenção**, não por reaproveitamento cego da mesma oferta. Houve resposta humana em produtos de grooming/beleza, games, utilidades e bens domésticos. Para escolher o teste, esse sinal foi cruzado com o último Radar real concluído (`f3ffe4cc-a339-47c1-a79a-5e97976b86ec`), que já contém preço, vendas, rating, desconto e comissão factual via marketplace.

**Shortlist para o teste comercial controlado:**

1. **Console Portátil R36S + 15.000 jogos — Shopee** — R$ 175,99; 696 vendas; 4,8★; 65% desconto; comissão efetiva 11%; comissão estimada R$ 19,36/venda; Score V3 71. Motivo: categoria games já mostrou 18 cliques humanos prováveis em console retrô histórico, agora combinada com demanda, reputação, desconto e comissão observados.
2. **Percarbonato de sódio 1kg/2kg — Shopee** — R$ 28,99; 7.080 vendas; 4,9★; 24% desconto; comissão efetiva 13%; R$ 3,77/venda; Score V3 70. Motivo: utilidade doméstica simples, prova de demanda forte, baixo atrito de preço e possibilidade clara de demonstração de uso.
3. **Cama/colchonete lavável para cachorro ou gato — Shopee** — R$ 21,90; 2.693 vendas; 4,9★; 39% desconto; comissão efetiva 13%; R$ 2,85/venda; Score V3 71. Motivo: baixo ticket, reputação alta e benefício visual/emocional fácil de comunicar.
4. **Ventilador Mondial 30cm — Shopee** — R$ 149,99; 2.296 vendas; 4,9★; 25% desconto; comissão efetiva 10%; R$ 15,00/venda; Score V3 71. Motivo: utilidade clara, marca conhecida, demanda observada e comissão absoluta relevante; serve como teste de ticket médio contra itens de impulso.
5. **Mini máquina de costura portátil — Shopee** — R$ 10,99; 6.417 vendas; 4,4★; 83% desconto; comissão efetiva 9%; R$ 0,99/venda; Score V3 71. Motivo: demonstração muito direta, grande volume de vendas e preço de impulso; rating menor que os demais deve ser tratado como ponto de atenção, não escondido.
6. **Caneta corretiva hidratante ZVEV — Shopee** — R$ 6,05; 9.215 vendas; 4,6★; 77% desconto; comissão efetiva 13%; R$ 0,79/venda; Score V3 75. Motivo: beleza/grooming já mostrou interesse humano no histórico; aqui há demanda factual muito superior e visual potencial alto, apesar da baixa comissão unitária.
7. **Brinquedo interativo para gatos com som de pássaro — Shopee** — R$ 6,54; 1.765 vendas; 4,7★; 62% desconto; comissão efetiva 11%; R$ 0,72/venda; Score V3 73. Motivo: demonstração curta e compreensível, apelo pet e baixo atrito de compra.
8. **Kit 3 sutiãs/top de academia — Shopee** — R$ 21,50; 934 vendas; 4,8★; 51% desconto; comissão efetiva 13%; R$ 2,80/venda; Score V3 71. Motivo: ticket baixo, desconto forte, rating alto e comissão suficiente para testar categoria moda sem depender de Shein.

**O que ficou fora apesar de clique histórico:**
- Lava e Seca Samsung, patinete elétrico, guarda-roupa e colchão magnético: tickets altos e/ou ausência de evidência comercial suficiente no registro histórico; não são bons candidatos para o primeiro teste de conversão rápida.
- Capacete Coquinho ML: bom sinal de clique humano, mas desconto modesto e registro histórico sem rating/vendas/comissão; deve voltar apenas quando houver evidência comercial atual comparável.
- Ofertas Shein: tinham cliques humanos prováveis, mas ficam fora desta frente de teste porque o escopo operacional atual prioriza Shopee/Mercado Livre/Amazon e o Radar atual não as qualificou.
- Joias de ticket extremamente baixo do Radar: possuem score e demanda, porém foram preteridas nesta primeira bateria para evitar concentração excessiva em produtos visualmente semelhantes e comissão absoluta muito pequena.

**Conclusão da Task 2:** o histórico confirma que clique humano sozinho não seleciona boa oferta. Os melhores candidatos para buscar venda agora são os que combinam **intenção/categoria já observada + demanda factual atual + preço plausível + reputação + desconto + comissão + facilidade de demonstrar valor**. A shortlist de 8 ofertas cria variação deliberada de ticket e categoria sem forçar marketplace ou produto.

**Status:** CONCLUÍDA.

---

### Task 3 — Auditar copy, CTA, hashtags e formato por canal

**Objetivo:** descobrir se a mensagem publicada informa o produto, mas não cria desejo, confiança ou ação.

**Escopo:**
- revisar copies reais de posts com maior tráfego humano provável;
- comparar estrutura de título, benefício, dor resolvida, prova, desconto, CTA, urgência factual e hashtags;
- respeitar invariantes de cada canal;
- não usar link em copy de Instagram/Facebook quando o fluxo atual não permite;
- manter primeiro comentário no Facebook e vitrine existente do Instagram.

**Saída obrigatória:** template comercial enxuto por canal e 2 variações de copy por oferta do teste.

**Critério de aceite:** toda copy deve responder “por que esse produto?”, “por que agora?” e “o que faço em seguida?” sem inventar escassez ou benefício.

**Tempo alvo:** 20–30 minutos.

---

### Task 4 — Auditar criativos e vídeos usados

**Objetivo:** identificar se os criativos atuais geram curiosidade sem intenção de compra ou se falham em demonstrar valor.

**Escopo:**
- comparar imagens, vídeos Gemini e vídeos extraídos de marketplace usados em posts reais;
- identificar qualidade visual, demonstração, benefício percebido, clareza do produto e CTA visual;
- não atribuir causalidade de venda sem dados de atribuição;
- escolher formato por produto, não por preferência estética.

**Saída obrigatória:** definição de criativo recomendado para cada oferta do teste: imagem, vídeo demonstrativo existente ou novo vídeo curto.

**Critério de aceite:** cada criativo precisa mostrar o produto/benefício rapidamente e ser adequado ao canal.

**Tempo alvo:** 20–30 minutos.

---

### Task 5 — Montar teste comercial controlado de 5–10 ofertas

**Objetivo:** testar venda real, não apenas clique.

**Escopo:**
- selecionar 5–10 ofertas de maior convicção;
- definir canal por oferta;
- limitar frequência para evitar saturação;
- usar copy e criativo definidos nas Tasks 3 e 4;
- garantir link monetizado e rastreável antes da publicação;
- registrar baseline e identificadores necessários para atribuição.

**Métricas mínimas:**
- posts publicados;
- clique bruto;
- clique humano provável;
- CTR humano quando denominador disponível;
- visitas válidas;
- vendas;
- comissão;
- conversão clique humano → venda.

**Critério de aceite:** teste pequeno, rastreável e com hipótese por oferta; não disparar volume indiscriminado.

**Tempo alvo de preparação:** 20–40 minutos. Janela de observação comercial é separada do tempo de implementação.

---

### Task 6 — Corrigir apenas o gargalo comprovado e escalar vencedores

**Objetivo:** implementar somente a mudança técnica/comercial que os dados das Tasks 1–5 provarem necessária.

Possíveis resultados aceitáveis:
- tráfego é majoritariamente técnico → corrigir medição/filtragem;
- há tráfego humano mas oferta ruim → melhorar curadoria;
- há oferta boa mas copy/criativo fraco → melhorar mensagem;
- há clique humano de alta intenção mas zero venda → revisar jornada pós-clique, preço, confiança, disponibilidade e atribuição;
- uma combinação vence → escalar somente o que converte.

**Critério de aceite:** mudança implantada, validada em fluxo real e acompanhada por métrica de conversão; nenhuma otimização sem hipótese comprovada.

## Definição de sucesso da frente

Sucesso mínimo:
- separar tráfego humano provável de tráfego técnico;
- selecionar e executar primeiro teste controlado;
- obter atribuição suficiente para saber quais ofertas/canais geram intenção real.

Sucesso comercial:
- gerar nova venda atribuível a uma oferta/canal do teste;
- depois repetir o padrão vencedor com disciplina de medição.

## Critérios de parada

- Não permanecer mais de uma task investigando o mesmo sintoma sem mudar a pergunta ou agir sobre evidência nova.
- Não criar novo subsistema se consulta/contrato existente resolver.
- Não forçar marketplace, produto ou canal a aparecer em resultado.
- Se uma hipótese for refutada, encerrá-la e seguir para a próxima task.
- Evitar múltiplos deploys; consolidar alterações antes de promover para produção.

## Ordem de execução

1. Task 1 — Qualificar tráfego real. ✅ Concluída.
2. Task 2 — Diagnosticar produto/preço/oferta. ✅ Concluída.
3. Task 3 — Copy/CTA/hashtags.
4. Task 4 — Criativos/vídeos.
5. Task 5 — Teste comercial controlado.
6. Task 6 — Corrigir gargalo comprovado e escalar.

Nenhuma task posterior deve ser usada para mascarar falha da anterior. Cada etapa produz evidência para a seguinte.
