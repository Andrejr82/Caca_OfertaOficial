# Security Checklist

- `.env.local` está no `.gitignore`.
- Nenhum token real em arquivos versionados.
- `SUPABASE_SERVICE_ROLE_KEY` não aparece em client component.
- Telegram token é usado apenas server-side.
- Supabase schema contém RLS.
- Policies SQL restringem por `auth.uid()`.
- Instagram e WhatsApp são semiautomáticos no MVP.
- `npm run security:check` passa.
