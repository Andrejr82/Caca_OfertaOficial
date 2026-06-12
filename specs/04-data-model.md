# Data Model

The persistence layer is Supabase Postgres. Every private table includes `user_id` and RLS policies that restrict access to the owning authenticated user.

## Tables

- `profiles`: user profile metadata.
- `offers`: affiliate offer records.
- `affiliate_links`: tracked links and sub_id values.
- `posts`: Telegram or future channel post records.
- `sales`: manual sale and commission records.
- `integration_logs`: operational logs for external integrations.
- `app_settings`: non-secret user settings.

## Storage

Bucket: `offer-images`

Expected object path:

```text
{user_id}/{offer_id}/{filename}
```

Only authenticated users may upload into their own prefix. Public access is not required for the MVP; image URLs may remain external until upload is implemented.
