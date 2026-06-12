# Security Constitution

1. No secrets in source code.
2. `.env.local`, `.env`, production env files and generated secret dumps must never be versioned.
3. Supabase RLS is mandatory for all private tables.
4. The frontend may use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. `SUPABASE_SERVICE_ROLE_KEY` is server-side only and should not be used in the MVP unless strictly necessary.
6. Telegram Bot Token is server-side only.
7. Instagram and WhatsApp remain semiautomatic in the MVP.
8. Only official APIs are allowed for future Instagram and WhatsApp automation.
9. No paid services are allowed without explicit user approval.
10. Logs must mask tokens, passwords, API keys and webhook secrets.
