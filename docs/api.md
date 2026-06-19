# Documentação de API Interna

Este documento lista as rotas expostas em `/src/app/api/` construídas em Next.js (App Router).

## 1. Geração de Copywriting e Rastreamento (`/api/ai/generate`)

**Método:** `POST`

**Descrição:** 
Dada uma oferta bruta recém inserida, recupera seus metadados, aciona a IA (Groq/Gemini) para formatar opções de persuasão e injeta os links (SubIDs) atrelados à oferta na tabela `affiliate_links`. Salva os rascunhos gerados na tabela `posts`.

**Autenticação:**
Sessão válida do Supabase exigida via cabeçalho ou cookies (App Router resolve nativamente).

**Corpo da Requisição (JSON):**
```json
{
  "offerId": "uuid-da-oferta"
}
```

**Retorno de Sucesso (Exemplo):**
```json
{
  "ok": true,
  "message": "Copys e rascunhos de posts gerados com sucesso!",
  "score": 8.5,
  "status": "approved"
}
```

## 2. Publicação via Telegram (`/api/publish/telegram`)

**Método:** `POST`

**Descrição:** 
Recupera um rascunho em formato de mensagem (tabela `posts`), concatena com o link rastreado ou imagem do produto e executa o disparo para o bot na API oficial do Telegram usando o `TELEGRAM_BOT_TOKEN`.

**Corpo da Requisição (JSON):**
```json
{
  "postId": "uuid-do-post"
}
```

**Comportamento:** Atualiza a tabela de `posts` para status `published` e `posted_at` = hora atual caso a API do Telegram retorne 200 OK.

## 3. Webhooks Scraper (Em desenvolvimento) (`/api/webhooks/scraper`)

**Método:** `POST`

**Descrição:**
Endpoint utilizado por ferramentas auxiliares (Extensão Chrome ou Puppeteer Serverless) para jogar dados de produto raspados diretamente no painel do usuário, populando a tabela `offers`.

## Notas Gerais sobre Erros (Status HTTP)
- `401 Unauthorized`: O usuário não enviou o Token de sessão válido na requisição.
- `400 Bad Request`: Payload ausente ou incompleto (zod parser failure).
- `404 Not Found`: Recurso/Oferta solicitada foi apagada do Supabase ou o ID é incorreto.
- `500/503`: Falha temporária da integração (ex: Groq Rate Limit) ou Supabase Down.
