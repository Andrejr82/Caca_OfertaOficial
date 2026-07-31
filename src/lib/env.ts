export const officialBrand = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Caça Oferta Oficial",
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_USERNAME || "caca.ofertaoficial",
  telegramName: process.env.NEXT_PUBLIC_TELEGRAM_NAME || "Caça Oferta Oficial",
  telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_URL || "https://t.me/caca_ofertaoficial",
  whatsappName: "Caça Oferta Oficial",
  whatsappUrl: process.env.NEXT_PUBLIC_WHATSAPP_URL || "https://chat.whatsapp.com/JxsNiCGyjnYEAmPhPRtd7G"
};

export function hasSupabasePublicEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function hasTelegramEnv() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID);
}

export function hasAmazonCreatorsEnv() {
  return Boolean(
    process.env.AMAZON_CLIENT_ID &&
    process.env.AMAZON_CLIENT_SECRET &&
    process.env.AMAZON_PARTNER_TAG
  );
}

export function hasFacebookEnv() {
  return Boolean(
    process.env.FACEBOOK_PAGE_ID &&
    (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN)
  );
}
