-- Retorna atomicamente os UUIDs materializados pelo lote Discovery atual.
-- O wrapper preserva o contrato v1 e restringe o resultado às identidades de entrada,
-- ao tenant, marketplace e correlation_id efetivamente persistidos na mesma transação.
create or replace function public.upsert_discovery_offers_v2(
  p_marketplace text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_result jsonb;
  v_offer_ids jsonb;
begin
  v_result := public.upsert_discovery_offers_v1(p_marketplace, p_rows);

  select coalesce(jsonb_agg(distinct o.id order by o.id), '[]'::jsonb)
    into v_offer_ids
  from public.offers o
  join jsonb_array_elements(p_rows) as input(row_data)
    on o.user_id::text = input.row_data->>'user_id'
   and o.platform = p_marketplace
   and o.explainability->>'correlation_id' = input.row_data->'explainability'->>'correlation_id'
   and (
     (p_marketplace = 'Shopee'
       and o.shopee_item_id = input.row_data->>'shopee_item_id')
     or
     (p_marketplace = 'Mercado Livre'
       and (
         (nullif(input.row_data->>'item_id', '') is not null
           and o.item_id = input.row_data->>'item_id')
         or
         (nullif(input.row_data->>'product_id', '') is not null
           and o.product_id = input.row_data->>'product_id')
       ))
     or
     (p_marketplace = 'Amazon'
       and o.product_id = input.row_data->>'product_id')
   );

  return v_result || jsonb_build_object('offer_ids', v_offer_ids);
end;
$$;

revoke all on function public.upsert_discovery_offers_v2(text, jsonb) from public;
revoke all on function public.upsert_discovery_offers_v2(text, jsonb) from anon;
revoke all on function public.upsert_discovery_offers_v2(text, jsonb) from authenticated;
grant execute on function public.upsert_discovery_offers_v2(text, jsonb) to service_role;
