-- Discovery V5 encerra os gates antes da persistência.
-- O RPC V1 legado ainda insere status='pending_manual_review' internamente.
-- O wrapper V2 corrige isso na mesma transação, somente para linhas cujo
-- payload foi explicitamente emitido com status='approved' pelo worker.

CREATE OR REPLACE FUNCTION public.upsert_discovery_offers_v2(
  p_marketplace text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_offer_ids jsonb;
BEGIN
  v_result := public.upsert_discovery_offers_v1(p_marketplace, p_rows);

  -- A aprovação é restrita ao estado final declarado pelo Discovery e não
  -- reativa ofertas rejeitadas, deletadas, publicadas ou selecionadas.
  UPDATE public.offers AS o
  SET status = 'approved'
  FROM jsonb_array_elements(p_rows) AS input(row_data)
  WHERE input.row_data->>'status' = 'approved'
    AND o.user_id::text = input.row_data->>'user_id'
    AND o.platform = p_marketplace
    AND o.status IN ('pending_manual_review', 'approved')
    AND (
      (p_marketplace = 'Shopee'
        AND o.shopee_item_id = input.row_data->>'shopee_item_id')
      OR
      (p_marketplace = 'Mercado Livre'
        AND (
          (NULLIF(input.row_data->>'item_id', '') IS NOT NULL
            AND o.item_id = input.row_data->>'item_id')
          OR
          (NULLIF(input.row_data->>'product_id', '') IS NOT NULL
            AND o.product_id = input.row_data->>'product_id')
        ))
      OR
      (p_marketplace = 'Amazon'
        AND o.product_id = input.row_data->>'product_id')
    );

  SELECT COALESCE(jsonb_agg(DISTINCT o.id ORDER BY o.id), '[]'::jsonb)
    INTO v_offer_ids
  FROM public.offers o
  JOIN jsonb_array_elements(p_rows) AS input(row_data)
    ON o.user_id::text = input.row_data->>'user_id'
   AND o.platform = p_marketplace
   AND o.explainability->>'correlation_id' = input.row_data->'explainability'->>'correlation_id'
   AND (
     (p_marketplace = 'Shopee'
       AND o.shopee_item_id = input.row_data->>'shopee_item_id')
     OR
     (p_marketplace = 'Mercado Livre'
       AND (
         (NULLIF(input.row_data->>'item_id', '') IS NOT NULL
           AND o.item_id = input.row_data->>'item_id')
         OR
         (NULLIF(input.row_data->>'product_id', '') IS NOT NULL
           AND o.product_id = input.row_data->>'product_id')
       ))
     OR
     (p_marketplace = 'Amazon'
       AND o.product_id = input.row_data->>'product_id')
   );

  RETURN v_result || jsonb_build_object('offer_ids', v_offer_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_discovery_offers_v2(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_discovery_offers_v2(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_discovery_offers_v2(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_discovery_offers_v2(text, jsonb) TO service_role;
