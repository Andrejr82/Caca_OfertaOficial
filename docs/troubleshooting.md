# Troubleshooting (Resolução de Problemas)

## 1. Engine do WhatsApp Desconecta ("Socket Closed")
**Sintoma:** O envio não ocorre. Ao logar no console do motor (`npm run whatsapp`), existem mensagens repetidas de "Websocket closed" ou "Not authorized".
**Solução:** 
A pasta de credenciais salvas `.baileys_auth/` pode estar corrompida.
1. Interrompa o Worker (Ctrl+C).
2. Delete a pasta completa: `rm -rf .baileys_auth/`.
3. Inicie o Worker de novo (`npm run whatsapp`).
4. Leia o QRCode com o aparelho celular.

## 2. API do Groq (IA) Falha Consistentemente
**Sintoma:** As mensagens estão saindo pobres e genéricas e o Painel marca `Score: 5.0` (O Fallback acionou).
**Solução:**
- O ambiente não possui a chave do Groq. Crie ou edite `.env.local` e valide a chave `GROQ_API_KEY`.
- Se a chave está certa, a conta Groq pode estar com Rate Limit estourado de Requisições por minuto. Basta aguardar 5 minutos que o painel retornará aos textos ricos automaticamente.

## 3. Disparo no Telegram Não Acontece
**Sintoma:** O frontend avisa "Enviado com sucesso" e status atualiza para "published", mas a foto e mensagem não aparecem no App.
**Solução:**
- Verifique se a chave de `TELEGRAM_BOT_TOKEN` confere com o BotFather.
- Verifique o CHAT ID (`@seu_canal_de_ofertas`).
- O mais importante: O bot DEVE ser promovido a Administrador dentro das configurações do grupo/canal do Telegram para poder enviar mensagens públicas.

## 4. Ofertas Não Aparecem para um Novo Operador (Problema RLS)
**Sintoma:** Um usuário logo cria uma conta e vai para o `/dashboard/offers` e a lista é vazia, mesmo o admin tendo dezenas de cadastros.
**Causa:** É o comportamento intencional. As tabelas do Supabase têm regras de Row Level Security vinculadas ao `auth.uid()`. Nenhum operador comum pode ver ou modificar a listagem do outro, garantindo integridade e sigilo comercial.
