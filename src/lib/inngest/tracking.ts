import { inngest } from "./client";
import { logger } from "@/lib/utils/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_DEVICE_TYPES = new Set(["desktop", "mobile", "tablet", "unknown"]);

function normalizeClickEventData(data: any) {
  const affiliateLinkId = String(data?.affiliateLinkId || "").trim();
  const source = String(data?.source || "direct").trim().slice(0, 160) || "direct";
  const requestedDeviceType = String(data?.deviceType || "unknown").trim().toLowerCase();
  const deviceType = ALLOWED_DEVICE_TYPES.has(requestedDeviceType) ? requestedDeviceType : "unknown";

  if (!affiliateLinkId) {
    throw new Error("Evento de clique sem affiliateLinkId.");
  }

  return { affiliateLinkId, source, deviceType };
}

/**
 * Worker: Process Click Background
 * Persiste somente campos analíticos mínimos e não registra UA, tokens ou URLs completas.
 */
export const processClickBackground = inngest.createFunction(
  { id: "process-click-tracking", retries: 3, triggers: [{ event: "tracking/click.registered" }] },
  async ({ event, step }: any) => {
    const { affiliateLinkId, source, deviceType } = normalizeClickEventData(event.data);

    logger.info("Processando clique assíncrono", {
      event: "tracking.click.processing",
      affiliateLinkId,
      source,
      deviceType,
    });

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      logger.error("Supabase Admin indisponível para tracking", undefined, {
        event: "tracking.click.config_missing",
        affiliateLinkId,
      });
      throw new Error("Supabase Admin client não configurado para processClickBackground.");
    }

    await step.run("insert-click-event", async () => {
      const { error } = await supabase.from("click_events").insert({
        affiliate_link_id: affiliateLinkId,
        source,
        device_type: deviceType,
      });

      if (error) {
        logger.error("Falha ao inserir evento de clique", undefined, {
          event: "tracking.click.insert_failed",
          affiliateLinkId,
          dbCode: error.code || "db_error",
        });
        throw new Error("Falha ao persistir click_event.");
      }
    });

    await step.run("increment-legacy-counter", async () => {
      const { data: link, error: selectError } = await supabase
        .from("affiliate_links")
        .select("id, clicks")
        .eq("id", affiliateLinkId)
        .single();

      if (selectError) {
        logger.error("Falha ao ler contador legado", undefined, {
          event: "tracking.click.legacy_read_failed",
          affiliateLinkId,
          dbCode: selectError.code || "db_error",
        });
        throw new Error("Falha ao ler contador legado.");
      }

      const { error: updateError } = await supabase
        .from("affiliate_links")
        .update({ clicks: (link?.clicks || 0) + 1 })
        .eq("id", affiliateLinkId);

      if (updateError) {
        logger.error("Falha ao atualizar contador legado", undefined, {
          event: "tracking.click.legacy_update_failed",
          affiliateLinkId,
          dbCode: updateError.code || "db_error",
        });
        throw new Error("Falha ao atualizar contador legado.");
      }
    });

    logger.info("Clique processado", {
      event: "tracking.click.completed",
      affiliateLinkId,
      source,
      deviceType,
    });

    return { status: "tracked", affiliateLinkId };
  }
);
