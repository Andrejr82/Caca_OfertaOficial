import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function logAuditAction(action: string, details?: string, targetUserId?: string) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Tenta inserir na tabela audit_logs
    const { error } = await supabase.from("audit_logs").insert({
      user_id: user.id,
      action,
      target_user_id: targetUserId || null,
      details: details || null
    });

    if (error) {
      console.warn("Falha ao salvar log de auditoria (tabela audit_logs pode estar pendente de migração):", error.message);
      // Fallback para logs do sistema
      console.log(`[AUDIT] User: ${user.id} | Action: ${action} | Details: ${details}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Erro na função de auditoria:", err);
    return false;
  }
}
