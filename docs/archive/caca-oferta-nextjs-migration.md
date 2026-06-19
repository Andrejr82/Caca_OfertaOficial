# Caça Oferta Oficial Next.js Migration Plan

## Discovery

- Current repository is a Python/Streamlit/SQLite MVP with FastAPI-adjacent modules.
- Target product is a web platform using Next.js App Router, TypeScript, Tailwind, Supabase Free and Vercel Hobby.
- Existing Python files are preserved as reference. The new production path is the Next.js app added at the repository root.

## Internal Agent Responsibilities

- Product Owner / Spec Lead: specs, acceptance criteria and traceability.
- Fullstack Architect: Next.js + Supabase architecture and folder boundaries.
- Security Engineer: secrets, RLS, environment policy and security harness.
- Supabase Engineer: schema, policies and storage guidance.
- Frontend Engineer: dashboard, forms, messages and settings UI.
- Backend/API Engineer: server actions, Telegram route handlers and domain services.
- QA/Test Engineer: Vitest tests, validation harness and evidence.
- DevOps/Deploy Engineer: Vercel docs, env vars and deploy checklist.

## Execution Order

1. Create specs and harness documents.
2. Scaffold Next.js, TypeScript, Tailwind and test tooling.
3. Create Supabase schema and typed domain modules.
4. Implement auth, dashboard, offers, messages, Telegram, tracking, sales and settings.
5. Add tests and security check.
6. Run install and validation commands.

## Non-Negotiables

- No paid services in MVP.
- No secrets in source code.
- No unofficial Instagram or WhatsApp automation.
- Supabase RLS is mandatory.
- Telegram token is server-side only.
