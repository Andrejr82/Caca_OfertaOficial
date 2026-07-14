import { createServerSupabaseClient } from "@/lib/supabase/server";

export type IntegrationLog = {
  id: string;
  created_at: string;
  user_id: string;
  integration: string;
  action: string;
  status: "success" | "error" | "pending";
  message: string;
  metadata: any;
};

export async function getIntegrationLogs(limit = 50): Promise<IntegrationLog[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("integration_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching integration logs:", error);
    return [];
  }

  return data as IntegrationLog[];
}
