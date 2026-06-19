# Automação (Inngest & Schedulers)

O projeto está sendo configurado para que a dependência de um clique manual do operador caia a zero nas fases avançadas.

## Inngest
A biblioteca `inngest` é o hub de controle e orquestração Serverless do app.

**Onde os arquivos residem:** `src/app/api/inngest/`

### Qual o papel do Inngest no projeto?
A Vercel impõe um limite máximo de 10 a 60 segundos de processamento para funções em seu plano Hobby/Pro.
Ações complexas, como processar Lotes Massivos de Ofertas, esperar o rate limit da IA (Groq/Gemini), validar URLs e despachar mensagens de 1 em 1 minuto para o WhatsApp exigiriam o bloqueio da interface do usuário e explodiriam o timeout do Vercel.

**Com Inngest:**
1. A API de captura (ex: vinda da Extensão Web) acerta o Backend.
2. O Backend só emite um Evento (`oferta.recebida`) para a Inngest e desliga a rota rapidamente em 1 segundo.
3. A infra da Inngest entra em ação, chamando as funções do worker registradas em Background pelo app, uma a uma.
4. Ela possui recurso nativo de "Sleep()", permitindo programar delays entre mensagens postadas.

## Polling Legado do WhatsApp
A versão nativa do "Engine" (`scripts/whatsapp-engine.cjs`) hoje pode agir como um simples loop "while true" com intervalos (setInterval) rodando num servidor persistente, checando se a tabela de `posts` e `offers` do Supabase possui coisas com status `aprovado_esperando_postagem`. Se sim, a engine posta e muda o status.
