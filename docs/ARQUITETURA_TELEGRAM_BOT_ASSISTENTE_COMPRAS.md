# Arquitetura do Assistente de Compras no Telegram

**Status:** especificação documentada; implementação futura

**Escopo:** bot conversacional separado do canal público `@caca_ofertaoficial`.

## 1. Objetivo

Criar um assistente que permita ao usuário pesquisar ofertas sob demanda, comparar produtos já classificados, criar alertas personalizados e receber notificações somente após consentimento explícito.

O bot não substitui o canal de ofertas. O canal continua sendo o meio de publicação editorial; o bot será o meio de busca e atendimento individual.

## 2. Separação de responsabilidades

| Componente | Função |
|---|---|
| Canal `@caca_ofertaoficial` | Publicação editorial de ofertas selecionadas |
| Novo bot Telegram | Busca, comparação, favoritos e alertas |
| Supabase | Ofertas, classificação, grupos, usuários e alertas |
| Vercel/Next.js | Webhook, APIs e painel administrativo |
| Oracle Cloud | Discovery, classificação e ingestão; não deve enviar mensagens individuais do bot |
| Official AI | Redação de respostas/copies; não decide a oferta |

O bot terá token, webhook, limites e auditoria próprios. Não se deve reutilizar o token do canal nem transformar o canal existente em bot.

## 3. Estrutura prevista

```text
src/app/api/telegram-bot/
├── webhook/route.ts
├── health/route.ts
└── alerts/route.ts

src/core/telegram-bot/
├── commands/
│   ├── start.ts
│   ├── help.ts
│   ├── buscar.ts
│   ├── alerta.ts
│   ├── favoritos.ts
│   └── cancelar.ts
├── intent/
├── search/
├── ranking/
├── alerts/
├── privacy/
└── types.ts

src/lib/telegram-bot/
├── telegram-client.ts
├── webhook-validator.ts
├── user-repository.ts
├── alert-repository.ts
├── offer-search.ts
└── rate-limiter.ts
```

## 4. Fluxo de busca

```text
Usuário inicia o bot
  → consentimento e política
  → interpretação da intenção
  → consulta ao Supabase
  → filtros de categoria, preço e marketplace
  → agrupamento de produtos equivalentes
  → ranking determinístico
  → resposta com evidências e link afiliado
```

Exemplo de intenção:

> “Quero um notebook gamer até R$ 4.000.”

A intenção deve ser convertida em filtros estruturados, nunca em uma busca livre sem limites.

## 5. Dados principais

### `telegram_bot_users`

- `id`
- `telegram_user_id`
- `username`
- `first_name`
- `consented_at`
- `blocked_at`
- `created_at`
- `updated_at`

### `telegram_alerts`

- `id`
- `user_id`
- `query`
- `normalized_intent`
- `category`
- `marketplace`
- `max_price`
- `min_discount`
- `active`
- `last_notified_at`
- `created_at`

### `telegram_searches`

- `id`
- `user_id`
- `query_hash`
- `normalized_intent`
- `result_count`
- `created_at`

### `telegram_bot_events`

- `id`
- `user_id`
- `event_type`
- `payload_redacted`
- `created_at`

Não armazenar mensagens completas quando um resumo estruturado for suficiente.

## 6. Comandos mínimos

- `/start` — consentimento e apresentação do serviço
- `/help` — instruções
- `/buscar` — pesquisa de ofertas
- `/alerta` — criação de alerta com confirmação
- `/meus_alertas` — listar alertas
- `/pausar` — pausar alertas
- `/retomar` — retomar alertas
- `/cancelar` — cancelar a operação atual
- `/favoritos` — listar favoritos
- `/excluir_dados` — apagar dados do usuário

## 7. Salvaguardas de marketplace

### Amazon

Não exibir preço ou disponibilidade a partir de scraping ou cache não autorizado. A exibição comercial deve usar uma fonte autorizada, como PA-API, Creators API ou feed permitido, com atualização e aviso de data/hora.

### Mercado Livre

Usar links afiliados gerados oficialmente, apenas em canais públicos declarados. O bot não pode abrir automaticamente o marketplace nem redirecionar o usuário sem clique explícito.

### Shopee

Usar somente links oficiais do programa e mídias aprovadas. Não gerar cliques artificiais, compras automatizadas ou conteúdo enganoso.

### Telegram

O bot só pode enviar mensagens a usuários que iniciaram/interagiram com ele. Alertas exigem opt-in, limite de frequência e comandos claros para pausar ou cancelar.

## 8. Variáveis de ambiente futuras

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_BOT_WEBHOOK_URL=
TELEGRAM_BOT_MAX_ALERTS_PER_USER=10
TELEGRAM_BOT_MIN_NOTIFICATION_INTERVAL_MINUTES=30
```

## 9. Métricas para não operar no escuro

A ausência de vendas não deve ser avaliada apenas pela quantidade de posts. Antes de novas automações, medir por canal, marketplace, categoria e intenção:

- impressões ou visualizações, quando disponíveis;
- cliques no link afiliado;
- CTR = cliques / visualizações;
- sessões atribuídas;
- conversões e pedidos aprovados;
- receita/comissão;
- taxa de ofertas expiradas;
- tempo entre publicação e clique;
- taxa de alertas abertos e desativados;
- conversão por faixa de preço e categoria.

O painel deve distinguir claramente:

1. produto extraído;
2. produto classificado;
3. oferta selecionada;
4. copy gerada;
5. publicação enviada;
6. clique atribuído;
7. conversão confirmada.

Sem essa separação, aumentar o volume de postagens apenas aumenta ruído e não comprova eficácia.

## 10. Estratégia de validação

Implementação futura em etapas:

1. webhook e `/start` em ambiente de teste;
2. consulta somente a ofertas já persistidas;
3. resposta sem alertas automáticos;
4. teste com poucos usuários autorizados;
5. medição de cliques por intenção e marketplace;
6. ativação de alertas com opt-in;
7. revisão após período mínimo de dados;
8. somente depois, expansão do número de usuários.

Nenhuma nova modalidade de venda deve ser considerada aprovada apenas porque o bot responde corretamente. A eficácia comercial precisa ser demonstrada por cliques, conversões e comissão atribuída.

## 11. Referências de conformidade

- [Telegram Bots](https://core.telegram.org/bots)
- [Telegram Bot FAQ — limites de envio](https://core.telegram.org/bots/faq)
- [Amazon Associates — políticas](https://affiliate-program.amazon.com/help/operating/policies?ac-ms-src=ac-nav)
- [Mercado Livre — compartilhamento de links](https://www.mercadolivre.com.br/l/afiliados-compartilhamento-de-publicacao)
- [Mercado Livre — direcionamento de visitas](https://www.mercadolivre.com.br/l/afiliados-direcionamento-de-visitas)
- [Shopee — termos do programa de afiliados](https://help.shopee.com.br/portal/10/article/124094-Programa-de-Afiliados-da-Shopee-Termos-e-Condi%C3%A7%C3%B5es)

## 12. Situação atual

Este documento descreve a arquitetura futura. Nenhum bot novo, tabela, webhook, alerta ou automação foi criado por meio desta especificação.
