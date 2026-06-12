export const officialBrand = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Caça Oferta Oficial",
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_USERNAME || "caca.ofertaoficial",
  telegramName: process.env.NEXT_PUBLIC_TELEGRAM_NAME || "Caça Oferta Oficial",
  telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_URL || "https://t.me/caca_ofertaoficial",
  whatsappName: "Caça Oferta Oficial",
  whatsappUrl: process.env.NEXT_PUBLIC_WHATSAPP_URL || "https://whatsapp.com/channel/0029VbCLje16rsQz9pKFeo3c"
};

export function hasSupabasePublicEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function hasTelegramEnv() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID);
}
