# Segurança

Práticas de segurança adotadas para proteger a infraestrutura e a plataforma Caça Oferta Oficial.

## Supabase RLS (Row Level Security)

Nenhum usuário pode ler ou modificar dados de outros usuários através do painel client-side. Todas as tabelas ativam proteção rígida ao nível da linha (`ENABLE ROW LEVEL SECURITY`). 

Exemplo de Política Aplicada (`schema.sql`):
```sql
create policy "offers select own" on public.offers for select using (auth.uid() = user_id);
create policy "offers insert own" on public.offers for insert with check (auth.uid() = user_id);
```

## Gestão de Segredos e Chaves

A plataforma adota o isolamento da Vercel para credenciais.

1. **Nunca comite chaves:** O `.env.local` está no `.gitignore`.
2. **Separação de Chaves Supabase:**
   - O `NEXT_PUBLIC_SUPABASE_ANON_KEY` é repassado ao navegador para autenticação via Cookies / SSR.
   - O `SUPABASE_SERVICE_ROLE_KEY` vive **exclusivamente** no lado Node.js, sendo usado nos arquivos de `src/lib/supabase/admin.ts`. Essa chave nunca deve ser enviada via JSON nas respostas de API.

## Prevenção em APIs e Server Actions

- Todos os endpoints em `src/app/api/` executam autenticação mandatória via `createServerSupabaseClient()`. Se o objeto `user` não for validado contra a sessão real do banco, a API retorna erro `401 Unauthorized` imediatamente.
- Todo payload (JSON body) nas Server Actions idealmente passa por Parsing via Zod para checar inferência de tipos em tempo de execução e prevenir Injeções baseadas em Objetos (NoSQL / JSON Injection no `explainability`).

## Infraestrutura do Scraper e WhatsApp
- Scripts autônomos (`whatsapp-engine.cjs`) se baseiam na verificação mútua de Hash nos cookies e nos tokens para evitar roubo de sessão. 
- Acesso à API de Copy (Groq) ocorre restritamente no Servidor para evitar vazamento da API Key de pagamento e prevenir manipulação de prompts (Prompt Injection) por parte de usuários mal-intencionados.
