-- Tendências IA: materializa ofertas válidas do Radar sem cohort editorial.
-- Reutiliza upsert_discovery_offers_v1 e converte somente ofertas novas para deferred.

create or replace function public.upsert_trend_radar_offers_v1(
  p_marketplace text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_row jsonb;
  v_user_id uuid;
  v_item_id text;
  v_product_id text;
  v_shopee_item_id text;
  v_existing_id uuid;
  v_existing_ids uuid[] := '{}'::uuid[];
  v_result jsonb;
begin
  if p_marketplace not in ('Shopee', 'Mercado Livre') then
    raise exception using errcode = '22023', message = 'Marketplace Radar inválido';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'p_rows Radar deve ser um array JSON';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_user_id := nullif(v_row->>'user_id', '')::uuid;
    v_item_id := nullif(v_row->>'item_id', '');
    v_product_id := nullif(v_row->>'product_id', '');
    v_shopee_item_id := nullif(v_row->>'shopee_item_id', '');
    v_existing_id := null;

    if p_marketplace = 'Shopee' and v_shopee_item_id is not null then
      select id into v_existing_id from public.offers
       where user_id = v_user_id and platform = 'Shopee' and shopee_item_id = v_shopee_item_id limit 1;
    elsif p_marketplace = 'Mercado Livre' then
      if v_item_id is not null then
        select id into v_existing_id from public.offers
         where user_id = v_user_id and platform = 'Mercado Livre' and item_id = v_item_id limit 1;
      end if;
      if v_existing_id is null and v_product_id is not null then
        select id into v_existing_id from public.offers
         where user_id = v_user_id and platform = 'Mercado Livre' and product_id = v_product_id limit 1;
      end if;
    end if;
    if v_existing_id is not null then
      v_existing_ids := array_append(v_existing_ids, v_existing_id);
    end if;
  end loop;

  v_result := public.upsert_discovery_offers_v1(p_marketplace, p_rows);

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_user_id := nullif(v_row->>'user_id', '')::uuid;
    v_item_id := nullif(v_row->>'item_id', '');
    v_product_id := nullif(v_row->>'product_id', '');
    v_shopee_item_id := nullif(v_row->>'shopee_item_id', '');

    update public.offers
       set status = 'deferred',
           explainability = coalesce(explainability, '{}'::jsonb) || jsonb_build_object(
             'provenance', 'external_radar', 'editorial_eligible', false
           ),
           notes = coalesce(notes, 'AI Radar: identidade canônica, fora do cohort editorial.'),
           updated_at = now()
     where user_id = v_user_id
       and platform = p_marketplace
       and id <> all(v_existing_ids)
       and ((p_marketplace = 'Shopee' and shopee_item_id = v_shopee_item_id)
         or (p_marketplace = 'Mercado Livre' and v_item_id is not null and item_id = v_item_id)
         or (p_marketplace = 'Mercado Livre' and v_item_id is null and v_product_id is not null and product_id = v_product_id));
  end loop;

  return v_result;
end;
$$;

revoke all on function public.upsert_trend_radar_offers_v1(text, jsonb) from public;
revoke all on function public.upsert_trend_radar_offers_v1(text, jsonb) from anon;
revoke all on function public.upsert_trend_radar_offers_v1(text, jsonb) from authenticated;
grant execute on function public.upsert_trend_radar_offers_v1(text, jsonb) to service_role;
