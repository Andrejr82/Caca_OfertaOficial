# Test Plan

## Unit

- Offer score calculation.
- Channel sub_id generation.
- Message generation.
- Offer Zod validation.
- Integration status.
- Secret masking.

## Integration

- Route handlers return safe errors when Telegram env vars are missing.
- Server actions validate payloads before database writes.

## Build

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run security:check`
- `npm run verify`

## Security

- Check ignored env files.
- Check suspicious secret patterns.
- Check service role usage boundaries.
- Check schema contains RLS and policies.

## Deploy

- Confirm Vercel env vars exist.
- Confirm Supabase schema has been applied.
- Confirm Telegram bot is channel administrator.
