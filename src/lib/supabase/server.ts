import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { hasSupabasePublicEnv } from "@/lib/env";

export async function createServerSupabaseClient() {
  if (!hasSupabasePublicEnv()) return null;

  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // O método `setAll` foi chamado a partir de um Server Component.
          // Isso pode ser ignorado se você tiver um middleware atualizando
          // a sessão do usuário.
        }
      }
    }
  });
}
