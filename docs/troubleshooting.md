# Resolução de Problemas Frequentes (Troubleshooting)

Este guia apresenta soluções para os problemas técnicos mais corriqueiros encontrados pelos operadores ou infraestrutura.

## 1. Problemas com o WhatsApp (`baileys`)

**Sintoma:** O painel indica que a oferta foi postada, mas o celular nunca mandou.
**Diagnóstico:** O processo em background (`npm run whatsapp` ou o deploy na Render) parou.
**Solução:**
- Se o script reiniciou infinitamente informando "Logged out", apague a pasta `.baileys_auth` ou a tabela de sessão do banco de dados (se estiver usando DBMigration), reinicie a aplicação e leia novamente o QR Code.
- O Baileys pode engasgar se a internet do aparelho hospedeiro da conta WhatsApp cair. Verifique a conexão Wi-Fi/4G do aparelho.

## 2. Problemas na Geração de IA

**Sintoma:** Ao clicar em "Gerar Textos", a tela carrega e acusa falha.
**Diagnóstico:** Timeout de Vercel ou Excedeu as cotas de token da Groq (Rate limit - HTTP 429).
**Solução:**
- Se o sistema bater na restrição `429 Too Many Requests`, o Inngest fará o backup com Backoff. Se estiver testando manualmente via dashboard, será preciso aguardar o limite voltar a encher.
- Opcionamente, altere nas configurações do painel ou no código fonte a LLM ativa de Groq para Gemini (via Google AI SDK) configurando a chave `GEMINI_API_KEY`.

## 3. Problemas com o Supabase (Dados não aparecem)

**Sintoma:** Você adiciona a oferta no banco pelo painel SQL Supabase e ela não aparece no Frontend.
**Diagnóstico:** Você adicionou a oferta esquecendo de preencher o `user_id` na tabela.
**Solução:** O RLS filtra as ofertas por `user_id`. Uma oferta recém-criada sem ID ou com ID do Admin não aparece pra usuários logados. Ao manipular manualmente o SQL, certifique-se de associar `user_id` válido.

## 4. Onde encontrar Logs?
O painel contém uma tabela oculta (SQL) chamada `integration_logs`. Acesse seu painel do Supabase -> Table Editor -> `integration_logs`. Você verá o payload exato retornado por erros do Telegram e Instagram, facilitando o debug.
