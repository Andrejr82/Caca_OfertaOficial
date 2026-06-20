# Segurança

O sistema lida indiretamente com as chaves privadas do administrador, assim como bancos de dados transacionais. Seguir as diretrizes de segurança é inegociável.

## 1. RLS (Row Level Security)
Esta é a camada primária de proteção do aplicativo inteiro.
- Não existem `SELECT * FROM offers` vindos do cliente no Next.js que retornem dados aleatórios. Todo fetch injeta o JWT (`auth.uid()`) na política.
- O arquivo `supabase/schema.sql` atesta isso: `create policy "offers select own" on public.offers for select using (auth.uid() = user_id)`.

## 2. Proteção nas API Routes
- Qualquer endpoint na pasta `/src/app/api` (exceto webhooks externos) passa por uma checagem de sessão:
  ```ts
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  ```

## 3. Proteção Webhooks (Inngest)
Para evitar que hackers disparem os background jobs deliberadamente fazendo um POST em `/api/inngest`:
- A biblioteca nativa da Inngest usa `INNGEST_SIGNING_KEY` para garantir via Hmac-SHA256 que o payload enviado realmente veio da cloud oficial da Inngest e não de terceiros falsificando a requisição.

## 4. Gestão do JWT
- Como um app Server-Side Rendered (Next 16), o JWT não fica exposto em LocalStorage no modelo tradicional vulnerável a XSS, ele fica ancorado em Cookies httpOnly (gestão do pacote `@supabase/ssr`).

## 5. Cuidados Adicionais
O arquivo `scripts/security-check.mjs` pode ser rodado para varrer `.env` e checar vazamentos de chaves Groq ou Supabase Service Role Key no Frontend. Nunca pule as checagens pré-commit de segurança (Lints).
