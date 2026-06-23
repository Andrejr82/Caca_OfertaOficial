import { inngest } from "./client";
import { logger } from "@/lib/utils/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Worker: Process Click Background
 * Responsável por realizar a inserção de tracking na tabela de eventos e a 
 * escrita paralela no contador legado da affiliate_links, tudo assincronamente.
 */
export const processClickBackground = inngest.createFunction(
  { id: "process-click-tracking", retries: 3, triggers: [{ event: "tracking/click.registered" }] },
  async ({ event, step }: any) => {
    logger.info("Processando clique assíncrono", { linkId: event.data.affiliateLinkId });
    
    const { affiliateLinkId, source, deviceType } = event.data;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      throw new Error("Supabase Admin client não configurado para processClickBackground.");
    }

    // 1. Inserir o evento analítico granular na nova fonte de verdade
    await step.run("insert-click-event", async () => {
      const { error } = await supabase.from("click_events").insert({
        affiliate_link_id: affiliateLinkId,
        source: source || 'direct',
        device_type: deviceType || 'unknown'
      });
      if (error) {
        logger.error("Falha ao inserir evento de clique", { error });
        throw new Error(`Erro SQL no click_events: ${error.message}`);
      }
    });

    // 2. Incrementar a coluna legada em affiliate_links (Retrocompatibilidade)
    await step.run("increment-legacy-counter", async () => {
      // Como não temos uma função RPC pronta 'increment_clicks', 
      // fazemos uma leitura seguida de escrita. O Inngest lida com retries caso haja lock de linha muito longo, 
      // mas isso pode sofrer race condition sob extrema carga. 
      // Uma RPC seria ideal, mas para MVP manteremos a lógica paralela aqui.
      const { data: link, error: selectError } = await supabase
        .from("affiliate_links")
        .select("id, clicks")
        .eq("id", affiliateLinkId)
        .single();
      
      if (selectError) throw selectError;

      const { error: updateError } = await supabase
        .from("affiliate_links")
        .update({ clicks: (link?.clicks || 0) + 1 })
        .eq("id", affiliateLinkId);

      if (updateError) throw updateError;
    });

    return { status: "tracked", affiliateLinkId };
  }
);
