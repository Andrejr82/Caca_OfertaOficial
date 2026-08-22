# Radar VNext — Benchmark First — Design

## Objetivo
Elevar a qualidade da aba Tendências IA para selecionar oportunidades realmente competitivas, sem reduzir o conceito de oportunidade a “produto barato”, e sem desperdiçar a estrutura já existente.

## Princípio central
Trocar o eixo atual de `popularidade + desconto anunciado + comissão + quotas de ticket` por:

`descoberta ampla -> família funcional -> benchmark real -> valor comercial -> demanda/velocidade -> monetização -> seleção final`.

Preço baixo sozinho não aprova. Preço alto sozinho não reprova. O produto precisa provar que é uma oportunidade comercial competitiva para sua família e contexto.

## Evidências da auditoria atual
- O Radar recente coletou mais de mil candidatos Shopee e centenas no Mercado Livre: o gargalo principal não é falta de matéria-prima.
- Grande parte do Top 20 atual chega com `peer_count <= 1`.
- No V4, ausência de peers ainda permite receber nota alta de competitividade usando desconto anunciado.
- A carteira final força faixas de ticket (impulse/core/upper/premium) em vez de deixar as melhores oportunidades vencerem.
- O projeto já possui `scripts/shopee-achadinho-v12.cjs`, com famílias funcionais, peers reais, confiança, comparação por preço, separação de kits/unidades, penalidade de catálogo e diversidade.
- O worker efetivo passa por `oracle-trends-radar-worker.cjs -> oracle-trends-radar-runner-final.cjs -> oracle-trends-radar-runner.cjs`, mantendo partes do motor V4 e patches sobrepostos.

## O que será reaproveitado
### Descoberta e dados
- OpenAPI afiliada Shopee e paginação oficial.
- Coletores oficiais Mercado Livre já existentes.
- Normalização de preço e integridade de preço.
- Identidade nativa (`shopId + itemId`, `productId/itemId`).
- Imagem oficial e provenance.
- Dados factuais de vendas, rating, desconto e comissão quando disponíveis.

### Qualidade e histórico
- Freshness de 7 dias e exclusão de ofertas já existentes.
- Deduplicação nativa/catálogo.
- Histórico interno por IDs oficiais.
- Classificação de cliques humanos/técnicos/ambíguos.
- Sales velocity somente quando computável.
- Fail-closed para dados ausentes.

### Inteligência já pronta
- `shopee-achadinho-v12.cjs` como base de peer/family intelligence.
- `buildPeerContext`.
- `classifyPeerIdentity`.
- compatibilidade de quantidade/kit.
- diversidade por família/loja.
- conceito de `achadinhoValue` e penalidade de catálogo.

### Persistência e UI
- `trend_radar_runs`.
- `trend_radar_products`.
- `direct_evidence`.
- fluxo `Solicitar Radar`.
- aprovação humana e materialização de oferta.
- aba Tendências IA existente.

## O que será aposentado
Não apagar de imediato. Primeiro retirar do caminho efetivo, manter compatibilidade e depois remover com teste de regressão.

1. **Quota fixa de ticket**: 6 impulse / 8 core / 4 upper / 2 premium.
2. **Competitividade por desconto quando não existem peers reais**.
3. **Mercado Livre `TESTAR` por fallback permissivo com score baixo**.
4. **Peso alto para comissão absoluta como substituto de chance de conversão**.
5. **Venda acumulada como sinal dominante de demanda quando existe evidência melhor de velocidade/contexto**.
6. **Camadas duplicadas de collector/runner/patch (`engine`, `runner`, `runner-final`) quando a migração permitir consolidar responsabilidades**.
7. **“Produto solo = competitivo”**. Solo passa a significar `competitividade não comprovada`.

## Novo modelo de decisão
### Gate A — Integridade mínima
Obrigatório:
- identidade nativa válida;
- preço atual positivo;
- link válido;
- imagem válida para handoff;
- marketplace/provenance conhecida;
- dados monetários nunca inventados.

Falhou: não participa da seleção principal.

### Gate B — Benchmark comercial
Primeiro tentar peer funcional real.

Confiança:
- `HIGH`: >= 5 peers comparáveis;
- `MEDIUM`: 3-4 peers;
- `LOW`: 1-2 peers;
- `NONE`: 0 peers.

Somente `MEDIUM/HIGH` pode afirmar “preço competitivo” com autoridade.

`LOW/NONE` não recebe pontos de preço relativo por desconto anunciado. Pode sobreviver apenas por sinais fortes independentes: valor absoluto excepcional, demanda/velocidade, reputação e monetização.

### Gate C — Viabilidade econômica
- Shopee: comissão factual obrigatória para `PRIORIDADE`; `TESTAR` pode aceitar retorno menor, mas nunca comissão inventada.
- Mercado Livre: ausência de comissão pública não deve zerar a oportunidade, mas também não pode ser compensada por um fallback automático para `TESTAR`.

### Gate D — Qualidade comercial
Produtos de catálogo comum, sem vantagem clara, recebem penalidade mesmo com comissão alta.

## Novo Score VNext — 100 pontos
### 1. Competitividade comprovada — 30 pts
- melhor preço normalizado com MEDIUM/HIGH peers: 30
- até 5% acima: 26
- até 10%: 22
- até 15%: 18
- até 25%: 10
- >25%: 0-5
- LOW/NONE: 0 nesta dimensão

### 2. Demanda e aceleração — 20 pts
Prioridade: velocity factual > ranking/best seller oficial > vendas acumuladas.
- aceleração forte: até 20
- best seller oficial forte: até 18
- volume consolidado sem velocidade: teto menor, até 14

### 3. Força da oferta / valor percebido — 15 pts
Reaproveitar lógica do Achadinho V1.2:
- preço absoluto atraente para a função;
- kit/quantidade coerente;
- utilidade clara;
- desconto factual como sinal secundário;
- penalidade de catálogo comum.

### 4. Retorno econômico — 10 pts
Premia comissão factual, mas reduz dependência do valor absoluto por venda.
Combinar percentual efetivo + valor estimado, com teto para impedir produto caro de dominar sozinho.

### 5. Reputação — 10 pts
- rating >= 4.8: 10
- >= 4.6: 8
- >= 4.3: 6
- >= 4.0: 4
- baixo rating pode reprovar no gate.

### 6. Conversão interna — 10 pts
- venda atribuída comprovada: até 10
- histórico suficiente sem conversão: 0 e sinal negativo de decisão
- histórico insuficiente: neutro, não penalizar produto novo por ausência de dados

### 7. Qualidade de execução — 5 pts
Identidade, imagem, link e potencial visual suficientes para campanha.

## Decisões VNext
- `PRIORIDADE`: >= 80 e nenhum gate crítico falhou.
- `TESTAR`: 65-79.
- `OBSERVAR`: 50-64 quando há sinal real, mas evidência incompleta.
- `IGNORAR`: < 50 ou gate crítico falhou.

Não haverá promoção artificial de `IGNORAR -> TESTAR` só por marketplace.

## Seleção final Top 20
1. Ordenar por score VNext.
2. Aplicar diversidade por família/loja para não repetir o mesmo achado.
3. Ticket vira atributo diagnóstico, não quota.
4. Se os 20 melhores forem baratos, entram os baratos.
5. Se produtos caros provarem competitividade e valor, entram também.
6. Não preencher vaga com produto fraco apenas para atingir uma faixa de preço.
7. Se houver menos de 20 oportunidades realmente boas, mostrar menos de 20.

## UI VNext
Cada card deve mostrar de forma curta:
- score e decisão;
- preço atual;
- benchmark: `R$ X vs mediana R$ Y`;
- número/confiança de peers;
- posição relativa de preço;
- demanda/velocity;
- comissão/retorno quando factual;
- rating;
- 3 razões determinantes;
- aviso `competitividade não comprovada` quando sem peers.

## Observabilidade
Persistir no snapshot:
- `peer_count`;
- `peer_confidence`;
- `peer_price_min/median/max`;
- `price_vs_peer_median_percent`;
- `benchmark_status`;
- `score_version`;
- breakdown VNext;
- razões de exclusão por gate;
- contagem de candidatos por estágio.

## Migração segura
- VNext deve rodar em shadow mode contra o mesmo pool antes de substituir V4.
- Comparar V4 x VNext em pelo menos 3 runs.
- Nenhuma publicação automática.
- Nenhuma mudança em campanha, Gemini ou `video-worker`.
- Só trocar o caminho oficial após comparação factual e aprovação humana.

## Política de deploy
Vercel possui limite diário. Durante implementação:
- não enviar cada task para `main`;
- acumular mudanças em commits destacados/branch de trabalho;
- rodar testes local/CI onde possível;
- consolidar em um único merge/deploy por bloco funcional;
- nunca redeployar somente por documentação/cosmética.

## Skills obrigatórias
- `obra/superpowers`: systematic-debugging antes de correções; writing-plans/executing-plans para execução; TDD; verification-before-completion antes de merge.
- `DietrichGebert/ponytail`: DRY/YAGNI; reaproveitar o que já existe antes de criar subsistema novo.
- `JuliusBrussee/caveman`: manter mudanças e documentação objetivas e pequenas.

## Oracle
Não auditar a VPS diretamente por este agente. Quando a execução chegar ao runtime Oracle, usar um prompt Gemini pronto para coletar evidências e retornar somente fatos, sem alterar nada.
