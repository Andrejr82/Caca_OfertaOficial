import { hasSupabasePublicEnv, hasTelegramEnv } from "@/lib/env";

export interface IntegrationStatus {
  name: string;
  status: "configured" | "missing" | "future";
  detail: string;
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    {
      name: "Supabase",
      status: hasSupabasePublicEnv() ? "configured" : "missing",
      detail: "Auth, Postgres, Storage e RLS"
    },
    {
      name: "Telegram",
      status: hasTelegramEnv() ? "configured" : "missing",
      detail: "Bot API server-side"
    },
    {
      name: "Instagram",
      status: process.env.INSTAGRAM_ACCESS_TOKEN ? "configured" : "missing",
      detail: "Meta Graph API oficial"
    },
    {
      name: "Groq AI",
      status: process.env.GROQ_API_KEY ? "configured" : "missing",
      detail: "Llama-3.3-70b-versatile"
    },
    {
      name: "WhatsApp",
      status: "configured",
      detail: "Semiautomático (Cópia rápida)"
    },
    {
      name: "Mercado Livre",
      status: "configured",
      detail: "Robô de Descoberta e Scraper de Produtos"
    }
  ];
}
