import { logger } from "@/lib/utils/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SaleWebhookPayload {
  platform: "Amazon" | "Shopee" | "MercadoLivre" | "Magalu";
  orderId: string;
  amount: number;
  commission: number;
  subId: string;
  status: "pending" | "approved" | "cancelled";
}

export class AnalyticsService {
  /**
   * Registra um clique no link de afiliado.
   * Já existente em algumas partes, mas centralizado aqui.
   */
  async trackClick(subId: string): Promise<void> {
    logger.info("Analytics.trackClick", { subId });
    try {
      const supabase = createSupabaseAdminClient();
      if (!supabase) return;
      // Incrementa a coluna clicks do affiliate_links
      // Nota: Idealmente usando rpc('increment_click')
      const { data, error } = await supabase
        .rpc("increment_affiliate_click", { sub_id_param: subId });
      
      if (error) {
        logger.warn("Erro ao incrementar click via rpc, fallback method. ", error);
      }
    } catch (e: any) {
      logger.error("Falha silenciosa no trackClick", { error: e.message });
    }
  }

  /**
   * Registra uma publicação efetivada.
   */
  async trackPublication(channel: string, offerId: string): Promise<void> {
    logger.info("Analytics.trackPublication", { channel, offerId });
    // TODO: Incrementar métricas agregadas diárias por canal.
  }

  /**
   * Calcula o CTR global ou por oferta
   */
  async calculateCTR(offerId?: string): Promise<number> {
    logger.info("Analytics.calculateCTR", { offerId });
    // STUB: Fazer agregação de cliques / impressoes (publicacoes)
    return 0.05; // 5% mock
  }

  /**
   * Registra uma venda proveniente de Webhooks de Integração
   * ⚠️ PREPARADO PARA IMPLEMENTAÇÃO: Amazon, Shopee, Mercado Livre, Magalu
   */
  async registerSale(payload: SaleWebhookPayload): Promise<void> {
    logger.info("Analytics.registerSale (STUB)", payload);
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;

    try {
      await supabase.from("sales").insert({
        order_id: payload.orderId,
        platform: payload.platform,
        amount: payload.amount,
        commission: payload.commission,
        sub_id: payload.subId,
        status: payload.status,
        registered_at: new Date().toISOString()
      });
      logger.info(`Venda registrada com sucesso: ${payload.orderId}`);
    } catch (e: any) {
      logger.error("Erro ao registrar venda", { error: e.message });
    }
  }
}

export const analyticsService = new AnalyticsService();
