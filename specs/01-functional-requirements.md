# Functional Requirements

| ID | Requirement |
| --- | --- |
| RF001 | Users can sign in with Supabase Auth email/password. |
| RF002 | Dashboard routes require an authenticated user. |
| RF003 | Dashboard shows offer, channel, platform and commission metrics. |
| RF004 | Users can create offers with platform, product, pricing, coupon, rating, commission, image URL, notes and status. |
| RF005 | Offer input is validated with Zod before persistence. |
| RF006 | The system calculates an offer score from discount, coupon, rating, commission, category, price and optional seasonality. |
| RF007 | The system generates Telegram copy with tracked link and affiliate disclosure. |
| RF008 | The system generates Instagram feed, Stories, Reels and carousel copy for manual publishing. |
| RF009 | The system generates WhatsApp copy for manual publishing. |
| RF010 | Users can generate tracked links with channel-specific sub_id values. |
| RF011 | Users can test Telegram configuration without exposing the bot token. |
| RF012 | Users can publish approved offers to Telegram and record post metadata. |
| RF013 | Users can manually record sales and commissions. |
| RF014 | Settings show whether Supabase and Telegram are configured without displaying secret values. |
| RF015 | Instagram and WhatsApp MVP workflows remain semiautomatic and official-API-ready. |
