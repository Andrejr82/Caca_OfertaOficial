import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function logAuditAction(
  action: string,
  details?: string,
  targetUserId?: string,
  userId?: string
): Promise<boolean> {
  try {
    let effectiveUserId = userId;
    let client: any = null;

    // Prioriza cliente admin (service role sem sessão/cookies) para isolar a auditoria da sessão do usuário
    const adminClient = createSupabaseAdminClient();
    if (adminClient) {
      client = adminClient;
    }

    // Se não temos userId definido, tenta resolver via server client com tratamento seguro de erro
    if (!effectiveUserId) {
      const serverClient = await createServerSupabaseClient();
      if (!serverClient) return false;
      client = client || serverClient;

      try {
        const { data: { user }, error: userError } = await serverClient.auth.getUser();
        if (userError || !user) return false;
        effectiveUserId = user.id;
      } catch (authErr) {
        console.warn("[AUDIT] Não foi possível resolver usuário autenticado para auditoria:", authErr);
        return false;
      }
    } else if (!client) {
      client = await createServerSupabaseClient();
    }

    if (!client || !effectiveUserId) return false;

    // Tenta inserir na tabela audit_logs
    const { error } = await client.from("audit_logs").insert({
      user_id: effectiveUserId,
      action,
      target_user_id: targetUserId || null,
      details: details || null
    });

    if (error) {
      console.warn("Falha ao salvar log de auditoria (tabela audit_logs pode estar pendente de migração):", error.message);
      // Fallback para logs do sistema
      console.log(`[AUDIT] User: ${effectiveUserId} | Action: ${action} | Details: ${details || ""}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Erro na função de auditoria:", err);
    return false;
  }
}
