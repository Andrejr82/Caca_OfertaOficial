# Acceptance Criteria

## Auth

- Unauthenticated dashboard access redirects to login when Supabase env vars are configured.
- Login uses email and password through Supabase Auth.
- Logout clears the session.

## Dashboard

- Shows total offers, approved offers, published offers and estimated commission.
- Shows integration status cards for Supabase, Telegram, Instagram and WhatsApp.
- Shows top scored offers when data exists.

## Offers

- Form rejects missing product name, platform, link and invalid numbers.
- Valid offer submission stores the score and user_id.
- Status values are limited to draft, approved, posted and rejected.

## Messages

- Telegram output includes product, price, coupon if present, tracked link, affiliate disclosure and price-change notice.
- Instagram output includes feed, Stories, Reels and carousel text.
- WhatsApp output is concise and includes tracked link and affiliate notice.

## Telegram

- Test button is disabled or returns unavailable when token/channel are missing.
- Publish only accepts approved offers.
- Published posts store external_id, channel, content and timestamp.

## Security

- RLS exists for all private tables.
- `.env.local` is ignored.
- Service role key is not imported into client code.
- Security check flags suspicious hardcoded tokens outside approved examples.
