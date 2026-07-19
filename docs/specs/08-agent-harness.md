# Agent Harness

## Agents

| Agent | Responsibilities | Expected Output |
| --- | --- | --- |
| Product Owner / Spec Lead | Requirements, acceptance, traceability | `specs/*` |
| Fullstack Architect | Next.js/Supabase architecture | folder structure and README |
| Security Engineer | Secrets, RLS, checks | `docs/SECURITY.md`, `scripts/security-check.mjs` |
| Supabase Engineer | SQL schema and setup | `supabase/schema.sql`, setup docs |
| Frontend Engineer | UI screens and components | dashboard, forms, message views |
| Backend/API Engineer | actions, route handlers, services | `src/lib/*`, `src/app/api/*` |
| QA/Test Engineer | tests and verification | `src/tests/*`, scripts |
| DevOps/Deploy Engineer | Vercel and runbooks | deploy docs and harness |

## Completion Criteria

- Specs exist and map to implementation.
- App builds without secrets.
- Tests and security checks are runnable.
- Deployment docs describe free-tier setup.
- Paid or unavailable integrations are marked future.
