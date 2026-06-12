"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logAuditAction } from "@/lib/security/audit";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirect("/login?error=supabase-env");
  }

  const { error, data } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // Registra auditoria de login
  if (data?.user) {
    await logAuditAction("login", `Usuário autenticado com sucesso: ${email}`);
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    await logAuditAction("logout", "Usuário efetuou logout voluntário.");
    await supabase.auth.signOut();
  }
  redirect("/login");
}
