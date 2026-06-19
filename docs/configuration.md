# Configurações do Ambiente

O projeto é guiado pelas variáveis de ambiente contidas no arquivo `.env.local`. Este arquivo **jamais** deve ser commitado no repositório.

## Supabase
- `NEXT_PUBLIC_SUPABASE_URL`: A URL do seu projeto no Supabase. É exposta para o client-side.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: A chave pública anônima. Operações de leitura/escrita são limitadas pelas políticas de RLS.
- `SUPABASE_SERVICE_ROLE_KEY`: A chave mestre do banco. **Uso Exclusivo no Backend/Servidor**. Ultrapassa qualquer regra RLS (Row Level Security). Nunca passe para o frontend.

## Inteligência Artificial
- `GROQ_API_KEY`: Token de autenticação da plataforma Groq (usada para o modelo llama-3.1). 
- `GROQ_MODEL`: Sobrescreve o modelo padrão. Omissão assume `llama-3.1-8b-instant`.
- `COPY_ENGINE_MODE`: Ajusta a complexidade das estratégias (`full`, `balanced`, `economy`).

## Telegram
- `TELEGRAM_BOT_TOKEN`: Gerado pelo BotFather. Utilizado pelo backend para efetuar `sendMessage` ou `sendPhoto`.
- `TELEGRAM_CHANNEL_ID`: O nome de usuário do canal destino (ex: `@caca_ofertaoficial`). O Bot precisa ser Administrador deste canal.

## Automação em Background
- `INNGEST_EVENT_KEY`: Chave de roteamento para orquestração de trabalhos pesados.
- `INNGEST_SIGNING_KEY`: Para garantir que a comunicação webhooks/inngest é segura.

## Estrutura do App_Settings
No banco de dados (tabela `app_settings`), os usuários guardam configurações exclusivas não-ambientais:
- Credenciais e Hash de Sessão do Baileys.
- Status do Scraper da conta.
Esses dados são restritos ao `user_id` correspondente graças às policies ativas no RLS.
