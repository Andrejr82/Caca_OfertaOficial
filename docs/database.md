# Modelagem do Banco de Dados

A persistência do Caça Oferta Oficial é feita integralmente no **Supabase** (PostgreSQL).

## Estrutura de Tabelas

A criação de tabelas é descrita oficialmente no arquivo `supabase/schema.sql`.

### 1. `profiles`
Estende os dados dos usuários do Supabase Auth.
- `id` (UUID): FK para `auth.users(id)`
- `full_name`: Nome completo.

### 2. `offers`
A tabela central do sistema.
- Armazena metadados raw raspados do produto (`product_name`, `platform`, `current_price`, `old_price`, `image_url`).
- Possui o campo `explainability` (JSONB) para guardar informações analíticas detalhadas do cálculo do Score comercial.
- Possui o `score` geral de conversão para ranking da IA.
- Status permitidos: `'draft'`, `'approved'`, `'posted'`, `'rejected'`.

### 3. `affiliate_links`
Tabela de rastreamento. Uma `Offer` possui vários `affiliate_links` (um para Telegram, um para Instagram, etc).
- `original_url`: URL bruta da loja.
- `tracked_url`: URL já encurtada com a tag de afiliado.
- `sub_id`: Tag UTM específica gerada (ex: `tg-tenis-nike`).
- O sistema obriga a chave única `(offer_id, channel)`.

### 4. `posts`
Registra mensagens preparadas para as redes ou já despachadas.
- `content`: O texto persuasivo gerado pela IA.
- `status`: `'draft'`, `'published'`, `'failed'`.
- Possui FKs para `offer_id` e `affiliate_link_id` do respectivo canal.

### 5. `sales`
Registro de comissões atrelado ao `affiliate_link_id` e `offer_id`. Auxilia no cálculo do ROI do afiliado.

### 6. `integration_logs` e `ai_copy_logs`
Tabelas essenciais de observabilidade do sistema.
- `integration_logs`: Loga erros e eventos de comunicação (falha com Telegram, erro de webhook, falha no Scraper). Guarda payloads brutos em `metadata` (JSONB).
- `ai_copy_logs`: Loga o desempenho da IA. Qual estratégia venceu o teste da Groq/Gemini, pontuação de copy e o modelo utilizado.

### 7. `app_settings`
Configurações isoladas do usuário. O campo `value` é JSONB para permitir o armazenamento dinâmico das variáveis do motor WhatsApp ou chaves isoladas.

## Políticas de RLS (Row Level Security)
**Todas** as tabelas acima ativam o RLS. Para acessar dados lidos a partir de chaves clientes, é imperativo que a query contenha o `auth.uid() = user_id`.
Scripts isolados (`scripts/*.cjs`) que utilizam a Service Role bypassam o RLS para atualizar status.
