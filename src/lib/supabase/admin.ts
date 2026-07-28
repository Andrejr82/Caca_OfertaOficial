import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY ou URL ausente no .env.local. Ações de admin desabilitadas.");
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Use at server-side boundaries whose work must bypass tenant RLS consistently
 * (for example, the Official AI persistence flow).
 */
export function createRequiredSupabaseAdminClient() {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required");
  }
  return client;
}
