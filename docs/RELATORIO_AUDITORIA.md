# Relatório de Auditoria de Segurança e Configurações

## 1. Mapeamento de Variáveis de Ambiente

Foi feita uma varredura cruzada entre o `.env.example` e a base de código real para verificar a aderência.

| Variável | Obrigatória | Utilizada | Onde é utilizada (Código Real) |
| -------- | ----------- | --------- | ------------------------------ |
| NEXT_PUBLIC_APP_NAME | Não | Sim | `src/lib/env.ts`, `src/lib/ai/groq.ts` |
| NEXT_PUBLIC_INSTAGRAM_USERNAME | Não | Sim | `src/lib/env.ts` |
| NEXT_PUBLIC_TELEGRAM_NAME | Não | Sim | `src/lib/env.ts` |
| NEXT_PUBLIC_TELEGRAM_URL | Não | Sim | `src/lib/env.ts` |
| NEXT_PUBLIC_SUPABASE_URL | Sim | Sim | Configuração base do Supabase (`env.ts`, etc) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Sim | Sim | Configuração base do Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Não | Provável | Scripts administrativos ou webhook (se houver) |
| TELEGRAM_BOT_TOKEN | Não* | Sim | `src/lib/telegram/client.ts` (*necessário para Telegram) |
| TELEGRAM_CHANNEL_ID | Não* | Sim | `src/lib/telegram/client.ts` |
| SHOPEE_APP_ID / SECRET | Não | ❌ Não Encontrado | Não localizado uso ativo de API nativa da Shopee. |
| AMAZON_ACCESS_KEY / SECRET | Não | ❌ Não Encontrado | Não localizado uso ativo de API nativa da Amazon. |
| MAGALU_PARTNER_ID | Não | ❌ Não Encontrado | Não localizado. |
| MERCADO_LIVRE_CLIENT_ID | Não | ❌ Não Encontrado | Não localizado. |
| INSTAGRAM_ACCESS_TOKEN | Não* | Sim | `src/lib/instagram/client.ts` (*necessário p/ Insta) |
| WHATSAPP_CLOUD_API_TOKEN | Não | ❌ Não Encontrado | O projeto usa Baileys Local, ignorando Cloud API token. |
| GROQ_API_KEY | Sim* | Sim | `src/lib/ai/groq.ts` |
| GROQ_MODEL | Não | Sim | `src/lib/ai/groq.ts` (Fallback default inserido no código) |
| INSTAGRAM_BUSINESS_ACCOUNT_ID | Não | Sim | Descoberta automática ocorre se vazio. (`instagram/client.ts`) |
| **FIRECRAWL_API_KEY** | Não Documentada | Sim | Encontrada no `src/lib/publish/scraper.ts`, mas ausente no `.env.example`. |

## 2. Relatório de Segurança

### 2.1 RLS (Row Level Security) do Supabase
✅ **Implementado corretamente**: O arquivo `schema.sql` atesta que todas as tabelas principais (`profiles`, `offers`, `affiliate_links`, `posts`, `sales`, etc) possuem **RLS habilitado**.
✅ As `Policies` foram declaradas vinculando `auth.uid() = user_id`, o que garante isolamento multi-tenant seguro (cada usuário vê apenas seus dados).
✅ Storage Bucket `offer-images` também está protegido com RLS e validações de pasta.

### 2.2 Vulnerabilidades Identificadas e Pontos de Atenção
⚠️ **Tokens Hardcoded**: O código real de extração foi bem desenvolvido puxando pelo `process.env`. No arquivo base não foram mapeados tokens chumbados nas funções (ex: `groq.ts` e `client.ts`).
⚠️ **Arquitetura do WhatsApp**: O `scripts/whatsapp-engine.cjs` usa `Baileys` sem sandbox isolada, rodando um express cru na porta 3001. Qualquer processo na máquina local pode dar POST para `/send` na porta 3001 e emitir mensagens simulando o usuário.
⚠️ **Exposição de Rota**: Não foram localizados middlewares de autenticação forte blindando o acesso de `/status` e `/send` do WhatsApp.

### 2.3 Integrações Seguras
✅ **Telegram**: Chamadas REST diretas em SSL (`https://api.telegram.org`) ocultando o token via backend.
✅ **Instagram**: Uso oficial de Meta Graph API ocultando o Token.
