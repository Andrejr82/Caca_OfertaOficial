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
2. Task 2 — Diagnosticar produto/preço/oferta.
3. Task 3 — Copy/CTA/hashtags.
4. Task 4 — Criativos/vídeos.
5. Task 5 — Teste comercial controlado.
6. Task 6 — Corrigir gargalo comprovado e escalar.

Nenhuma task posterior deve ser usada para mascarar falha da anterior. Cada etapa produz evidência para a seguinte.
