"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logAuditAction } from "@/lib/security/audit";

function schedulePostResponseTask(task: () => Promise<unknown> | unknown) {
  try {
    after(async () => {
      try {
        await task();
      } catch (err) {
        console.warn("[AUDIT] Erro na execução pós-resposta de auditoria:", err);
      }
    });
  } catch {
    // Fallback assíncrono seguro caso chamado fora de contexto de request (ex: testes)
    Promise.resolve().then(task).catch((err) => {
      console.warn("[AUDIT] Fallback assíncrono de auditoria falhou:", err);
    });
  }
}

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

  // Registra auditoria de login via pós-resposta do Next.js sem bloquear o redirect
  // e reutilizando o userId já autenticado para evitar disputa concorrente de sessão/refresh.
  if (data?.user?.id) {
    const userId = data.user.id;
    schedulePostResponseTask(async () => {
      await logAuditAction("login", `Usuário autenticado com sucesso: ${email}`, undefined, userId);
    });
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) {
        const userId = data.user.id;
        schedulePostResponseTask(async () => {
          await logAuditAction("logout", "Usuário efetuou logout voluntário.", undefined, userId);
        });
      }
    } catch (err) {
      console.warn("[AUTH] Erro ao obter usuário para auditoria de logout:", err);
    }
    await supabase.auth.signOut();
  }
  redirect("/login");
}

