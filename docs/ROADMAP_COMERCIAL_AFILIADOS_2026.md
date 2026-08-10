# Roadmap Comercial — Afiliados de Marketplaces

Data: 2026-08-09

## Direção estratégica

A operação deve evoluir de simples distribuição de ofertas para um modelo orientado por:

- curadoria;
- demonstração;
- aquisição de audiência;
- conversão em canais diretos;
- medição por clique, venda, comissão e EPC.

Pilares recomendados:

- Shopee + Mercado Livre como marketplaces principais;
- Amazon seletiva até comprovar retorno;
- Instagram para aquisição;
- WhatsApp para conversão;
- Telegram para volume/arquivo;
- Facebook principalmente para reaproveitamento;
- YouTube como ativo evergreen em fase posterior.

---

## Tasks prioritárias

### 1. Vídeos de Ofertas — corrigir bugs críticos

- corrigir dublagem repetida entre vídeos;
- impedir que o recorte de um vídeo afete outros;
- corrigir perda da opção de recorte;
- investigar queda de qualidade na publicação;
- preservar voz, modelo e copy já aprovados.

### 2. Instagram como canal de aquisição

- priorizar Reels e vídeos demonstrativos;
- reaproveitar vídeos de ofertas;
- usar CTA claro para WhatsApp;
- reduzir dependência de card estático.

### 3. WhatsApp como canal de conversão

- testar curadoria de poucas ofertas fortes;
- diferenciar “melhores do dia” de fluxo de alta frequência;
- medir clique → venda → comissão;
- evitar volume indiscriminado no canal principal.

### 4. Evoluir o score comercial das ofertas

Adicionar gradualmente sinais como:

- preço real;
- desconto confiável;
- frete;
- utilidade/demonstrabilidade;
- comissão em reais;
- conversão histórica;
- EPC quando houver dados suficientes.

### 5. Mercado Livre — integrar vendas reais

- obter relatório oficial;
- fazer dry-run;
- adaptar parser apenas se necessário;
- importar pelo writer canônico já existente;
- não criar pipeline paralelo.

### 6. Dashboard comercial

Criar visão consolidada de:

- cliques;
- vendas;
- conversão;
- comissão líquida;
- EPC;
- marketplace;
- canal;
- produto/categoria;
- vendas atribuídas vs não atribuídas.

### 7. Comparar Shopee x Mercado Livre com dados próprios

Depois de acumular amostra suficiente, medir:

- comissão por clique;
- comissão por publicação;
- conversão;
- ticket;
- cancelamentos;
- receita por categoria;
- receita por hora trabalhada.

### 8. Telegram

- manter como canal de volume e arquivo;
- corrigir depois intro de horário/saudação;
- não tratar como principal mecanismo de aquisição.

### 9. Facebook

- reduzir produção exclusiva;
- reaproveitar vídeos e conteúdos;
- medir retorno antes de dedicar mais esforço.

### 10. Amazon

- decidir formalmente entre pausa ou uso seletivo;
- não tratar como pilar até preço, conversão e EPC justificarem;
- se continuar ativa, aprofundar integridade de preço.

### 11. YouTube — fase posterior

- reviews;
- comparativos;
- “vale a pena?”;
- produtos de ticket médio/alto;
- conteúdo evergreen.

### 12. Dívidas menores

- corrigir mensagem falsa “30 novas ofertas carregadas”;
- corrigir intro Telegram;
- revisar ajustes restantes de layout;
- tratar falhas globais preexistentes fora dos deltas das tasks.

---

## Ordem recomendada

1. Vídeos de Ofertas
2. Instagram
3. WhatsApp
4. Score comercial
5. Mercado Livre — vendas reais
6. Dashboard comercial
7. Comparativo Shopee x Mercado Livre
8. Telegram
9. Facebook
10. Amazon
11. YouTube
12. Dívidas menores

---

## Regra de execução

Para cada task:

1. auditar runtime real, repo e banco quando aplicável;
2. provar causa ou contrato antes de implementar;
3. usar prompt curto e cirúrgico;
4. evitar ciclos reais e writes sem etapa explícita;
5. validar focused tests, ESLint, Build e `git diff --check`;
6. separar falhas preexistentes de regressões novas;
7. só então commit/push.
