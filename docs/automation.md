# Automação

No projeto, a "automação" separa o processo criativo manual do envio em massa. Existem dois vetores centrais de automação.

## Orquestração com Inngest
A biblioteca Inngest muda o paradigma de crons falhos do Linux para um sistema baseado em Eventos.

- Em `src/lib/inngest/functions.ts`, temos a função `processOfferBackground`. Quando um sistema manda o evento `offer/process`, a Inngest gerencia os *retries*.
- Exemplo prático: O scraping falhou porque a página do Mercado Livre bloqueou o IP. A Inngest captura o timeout/exceção do Next.js e faz backup recursivo usando *Exponential Backoff* garantindo que a rotina vai tentar importar a oferta 2, 4 ou 8 horas depois, e nunca se perde no banco.

## Engine Persistente do WhatsApp
Automatizar o Whatsapp sem pagar a API Oficial cara (Business API) requer a biblioteca Baileys, que funciona como um client Web em Node.
- Como rodar automação constante? O script `whatsapp-engine.cjs` usa `setInterval` ou gatilhos de banco (Polling) para ler novos posts.
- Para automação de resposta (em desenvolvimento), o próprio script consegue injetar mensagens lidas em um LLM Chat e auto-responder os usuários (ex: Bot FAQ).

## Rotinas Agendadas ("Cronjobs")
A plataforma não usa CRONTAB ou schedulers primitivos, toda a cadência de raspagem automática e publicação programada é ditada nos arquivos das rotas Inngest que oferecem a função `inngest.createFunction({ cron: '0 * * * *' }, ... )`.
