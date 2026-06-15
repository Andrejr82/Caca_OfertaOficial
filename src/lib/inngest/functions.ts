import { inngest } from "./client";
import { logger } from "@/lib/utils/logger";
import { publisher } from "@/lib/publisher";

/**
 * Função de Fila: Publicação
 * Retira o bloqueio síncrono do front-end/cron ao publicar nas redes.
 */
export const publishPostBackground = inngest.createFunction(
  { id: "publish-post", retries: 3 },
  { event: "post/publish" },
  // @ts-expect-error type inference from inngest can be tricky
  async ({ event, step }: any) => {
    logger.info("Executando fila Inngest: post/publish", { eventId: event.id });
    
    const { channel, payload } = event.data as any;

    const result = await step.run("publish-to-channel", async () => {
      return await publisher.publish(channel, payload);
    });

    if (!result.success) {
      throw new Error(`Falha no publisher: ${result.error}`);
    }

    return { result };
  }
);

/**
 * Função de Fila: Scraping & IA (STUB)
 * Preparado para substituir o processamento síncrono no Cron
 */
export const processOfferBackground = inngest.createFunction(
  { id: "process-offer", retries: 2 },
  { event: "offer/process" },
  // @ts-expect-error inngest type inference issue
  async ({ event, step }: any) => {
    logger.info("Processando oferta em background", { url: event.data.url });
    // TODO: Invocar scraper + gerador de copy da Groq aqui
    return { status: "processed" };
  }
);

/**
 * Função de Fila: Analytics (STUB)
 */
export const syncAnalyticsBackground = inngest.createFunction(
  { id: "sync-analytics" },
  { event: "analytics/sync" },
  // @ts-expect-error inngest type inference issue
  async ({ event, step }: any) => {
    logger.info("Sincronizando analytics em background", { source: event.data.source });
    return { synced: true };
  }
);
