-- 1. PREFLIGHT DEFENSIVO
-- A migration assume que public.offers existe, bem como o índice offers_shopee_native_item_unique.

-- 2. CRIAÇÃO DE ÍNDICES PARCIAIS (se não existirem)
-- O índice shopee (offers_shopee_native_item_unique) já deve estar presente. Não o excluímos.

-- MERCADO LIVRE — ITEM
CREATE UNIQUE INDEX IF NOT EXISTS offers_ml_native_item_unique
ON public.offers (user_id, platform, item_id)
WHERE platform = 'Mercado Livre'
  AND item_id IS NOT NULL;

-- MERCADO LIVRE — PRODUCT
CREATE UNIQUE INDEX IF NOT EXISTS offers_ml_native_product_unique
ON public.offers (user_id, platform, product_id)
WHERE platform = 'Mercado Livre'
  AND product_id IS NOT NULL;

-- AMAZON — ASIN
CREATE UNIQUE INDEX IF NOT EXISTS offers_amazon_native_product_unique
ON public.offers (user_id, platform, product_id)
WHERE platform = 'Amazon'
  AND product_id IS NOT NULL;

-- AMAZON — REGISTROS LEGADOS SEM ASIN
CREATE UNIQUE INDEX IF NOT EXISTS offers_amazon_legacy_url_unique
ON public.offers (user_id, platform, original_url)
WHERE platform = 'Amazon'
  AND product_id IS NULL
  AND original_url IS NOT NULL;

-- 3. CRIAÇÃO DA RPC
CREATE OR REPLACE FUNCTION public.upsert_discovery_offers_v1(
    p_marketplace text,
    p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row jsonb;
    v_total int := 0;
    v_inserted int := 0;
    v_updated int := 0;
    v_ignored int := 0;
    v_failed int := 0;
    
    v_user_id uuid;
    v_platform text;
    v_shopee_item_id text;
    v_item_id text;
    v_product_id text;
    v_original_url text;
    v_product_name text;
    v_status text;
    v_current_status text;
    v_id uuid;
BEGIN
    -- Validar marketplace
    IF p_marketplace NOT IN ('Shopee', 'Mercado Livre', 'Amazon') THEN
        RAISE EXCEPTION 'Marketplace inválido: %', p_marketplace;
    END IF;

    -- Validar se quem chama é service_role ou usuário autenticado
    -- Caso necessário limitar apenas ao service_role: 
    -- IF current_setting('role') <> 'service_role' THEN RAISE EXCEPTION 'Acesso negado'; END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        v_total := v_total + 1;
        
        BEGIN
            v_user_id := (v_row->>'user_id')::uuid;
            v_platform := v_row->>'platform';
            v_status := COALESCE(v_row->>'status', 'pending_manual_review');
            
            IF v_platform IS NULL OR v_platform <> p_marketplace THEN
                v_failed := v_failed + 1;
                CONTINUE;
            END IF;

            -- ==========================================
            -- SHOPEE
            -- ==========================================
            IF p_marketplace = 'Shopee' THEN
                v_shopee_item_id := v_row->>'shopee_item_id';
                
                IF v_shopee_item_id IS NULL THEN
                    v_failed := v_failed + 1;
                    CONTINUE;
                END IF;

                -- Obter status atual se existir
                SELECT status, id INTO v_current_status, v_id FROM public.offers 
                WHERE user_id = v_user_id AND platform = 'Shopee' AND shopee_item_id = v_shopee_item_id;

                IF FOUND THEN
                    IF v_current_status IN ('selected', 'approved', 'posted', 'rejected') THEN
                        -- Preservar status existente, atualizar dados mutáveis
                        UPDATE public.offers SET
                            product_name = COALESCE(v_row->>'product_name', product_name),
                            category = COALESCE(v_row->>'category', category),
                            original_url = COALESCE(v_row->>'original_url', original_url),
                            image_url = COALESCE(v_row->>'image_url', image_url),
                            current_price = COALESCE((v_row->>'current_price')::numeric, current_price),
                            old_price = COALESCE((v_row->>'old_price')::numeric, old_price),
                            score = COALESCE((v_row->>'score')::numeric, score),
                            explainability = COALESCE(v_row->>'explainability', explainability),
                            notes = COALESCE(v_row->>'notes', notes),
                            shopee_shop_id = COALESCE(v_row->>'shopee_shop_id', shopee_shop_id),
                            shopee_product_cat_id = COALESCE((v_row->>'shopee_product_cat_id')::bigint, shopee_product_cat_id),
                            native_category_order = COALESCE((v_row->>'native_category_order')::int, native_category_order),
                            native_category_position = COALESCE((v_row->>'native_category_position')::int, native_category_position),
                            updated_at = NOW()
                        WHERE id = v_id;
                        v_updated := v_updated + 1;
                    ELSE
                        -- pending_manual_review ou outro
                        UPDATE public.offers SET
                            product_name = COALESCE(v_row->>'product_name', product_name),
                            category = COALESCE(v_row->>'category', category),
                            original_url = COALESCE(v_row->>'original_url', original_url),
                            image_url = COALESCE(v_row->>'image_url', image_url),
                            current_price = COALESCE((v_row->>'current_price')::numeric, current_price),
                            old_price = COALESCE((v_row->>'old_price')::numeric, old_price),
                            score = COALESCE((v_row->>'score')::numeric, score),
                            explainability = COALESCE(v_row->>'explainability', explainability),
                            notes = COALESCE(v_row->>'notes', notes),
                            shopee_shop_id = COALESCE(v_row->>'shopee_shop_id', shopee_shop_id),
                            shopee_product_cat_id = COALESCE((v_row->>'shopee_product_cat_id')::bigint, shopee_product_cat_id),
                            native_category_order = COALESCE((v_row->>'native_category_order')::int, native_category_order),
                            native_category_position = COALESCE((v_row->>'native_category_position')::int, native_category_position),
                            updated_at = NOW()
                        WHERE id = v_id;
                        v_updated := v_updated + 1;
                    END IF;
                ELSE
                    -- Inserir
                    INSERT INTO public.offers (
                        user_id, platform, shopee_item_id, product_name, original_url, current_price, status,
                        category, image_url, old_price, score, explainability, notes,
                        shopee_shop_id, shopee_product_cat_id, native_category_order, native_category_position,
                        created_at, updated_at
                    ) VALUES (
                        v_user_id, 'Shopee', v_shopee_item_id, v_row->>'product_name', v_row->>'original_url', COALESCE((v_row->>'current_price')::numeric, 0), v_status,
                        v_row->>'category', v_row->>'image_url', (v_row->>'old_price')::numeric, (v_row->>'score')::numeric, v_row->>'explainability', v_row->>'notes',
                        v_row->>'shopee_shop_id', (v_row->>'shopee_product_cat_id')::bigint, (v_row->>'native_category_order')::int, (v_row->>'native_category_position')::int,
                        NOW(), NOW()
                    );
                    v_inserted := v_inserted + 1;
                END IF;

            -- ==========================================
            -- MERCADO LIVRE
            -- ==========================================
            ELSIF p_marketplace = 'Mercado Livre' THEN
                v_item_id := v_row->>'item_id';
                v_product_id := v_row->>'product_id';
                
                IF v_item_id IS NULL AND v_product_id IS NULL THEN
                    v_failed := v_failed + 1;
                    CONTINUE;
                END IF;

                -- Precedência: 1. item_id, 2. product_id
                v_id := NULL;
                IF v_item_id IS NOT NULL THEN
                    SELECT status, id INTO v_current_status, v_id FROM public.offers 
                    WHERE user_id = v_user_id AND platform = 'Mercado Livre' AND item_id = v_item_id;
                ELSE
                    SELECT status, id INTO v_current_status, v_id FROM public.offers 
                    WHERE user_id = v_user_id AND platform = 'Mercado Livre' AND product_id = v_product_id;
                END IF;

                IF v_id IS NOT NULL THEN
                    -- Update fields preserving status
                    UPDATE public.offers SET
                        product_name = COALESCE(v_row->>'product_name', product_name),
                        category = COALESCE(v_row->>'category', category),
                        original_url = COALESCE(v_row->>'original_url', original_url),
                        image_url = COALESCE(v_row->>'image_url', image_url),
                        current_price = COALESCE((v_row->>'current_price')::numeric, current_price),
                        old_price = COALESCE((v_row->>'old_price')::numeric, old_price),
                        score = COALESCE((v_row->>'score')::numeric, score),
                        explainability = COALESCE(v_row->>'explainability', explainability),
                        notes = COALESCE(v_row->>'notes', notes),
                        item_id = COALESCE(v_item_id, item_id),
                        product_id = COALESCE(v_product_id, product_id),
                        category_id = COALESCE(v_row->>'category_id', category_id),
                        category_name = COALESCE(v_row->>'category_name', category_name),
                        source_position = COALESCE((v_row->>'source_position')::int, source_position),
                        seller_id = COALESCE(v_row->>'seller_id', seller_id),
                        seller_name = COALESCE(v_row->>'seller_name', seller_name),
                        shipping_free = COALESCE((v_row->>'shipping_free')::boolean, shipping_free),
                        source_categories = COALESCE(v_row->'source_categories', source_categories),
                        updated_at = NOW()
                    WHERE id = v_id;
                    v_updated := v_updated + 1;
                ELSE
                    -- Insert
                    INSERT INTO public.offers (
                        user_id, platform, item_id, product_id, product_name, original_url, current_price, status,
                        category, image_url, old_price, score, explainability, notes,
                        category_id, category_name, source_position, seller_id, seller_name, shipping_free, source_categories,
                        created_at, updated_at
                    ) VALUES (
                        v_user_id, 'Mercado Livre', v_item_id, v_product_id, v_row->>'product_name', v_row->>'original_url', COALESCE((v_row->>'current_price')::numeric, 0), v_status,
                        v_row->>'category', v_row->>'image_url', (v_row->>'old_price')::numeric, (v_row->>'score')::numeric, v_row->>'explainability', v_row->>'notes',
                        v_row->>'category_id', v_row->>'category_name', (v_row->>'source_position')::int, v_row->>'seller_id', v_row->>'seller_name', (v_row->>'shipping_free')::boolean, v_row->'source_categories',
                        NOW(), NOW()
                    );
                    v_inserted := v_inserted + 1;
                END IF;

            -- ==========================================
            -- AMAZON
            -- ==========================================
            ELSIF p_marketplace = 'Amazon' THEN
                v_product_id := v_row->>'product_id';
                v_original_url := v_row->>'original_url';
                
                IF v_product_id IS NULL THEN
                    v_failed := v_failed + 1;
                    CONTINUE;
                END IF;

                -- Obter status atual se existir (pelo ASIN = product_id)
                SELECT status, id INTO v_current_status, v_id FROM public.offers 
                WHERE user_id = v_user_id AND platform = 'Amazon' AND product_id = v_product_id;

                IF v_id IS NOT NULL THEN
                    -- Update preserving status
                    UPDATE public.offers SET
                        product_name = COALESCE(v_row->>'product_name', product_name),
                        category = COALESCE(v_row->>'category', category),
                        original_url = COALESCE(v_original_url, original_url),
                        image_url = COALESCE(v_row->>'image_url', image_url),
                        current_price = COALESCE((v_row->>'current_price')::numeric, current_price),
                        old_price = COALESCE((v_row->>'old_price')::numeric, old_price),
                        score = COALESCE((v_row->>'score')::numeric, score),
                        explainability = COALESCE(v_row->>'explainability', explainability),
                        notes = COALESCE(v_row->>'notes', notes),
                        product_id = COALESCE(v_product_id, product_id),
                        source_position = COALESCE((v_row->>'source_position')::int, source_position),
                        updated_at = NOW()
                    WHERE id = v_id;
                    v_updated := v_updated + 1;
                ELSE
                    -- Insert
                    INSERT INTO public.offers (
                        user_id, platform, product_id, product_name, original_url, current_price, status,
                        category, image_url, old_price, score, explainability, notes, source_position,
                        created_at, updated_at
                    ) VALUES (
                        v_user_id, 'Amazon', v_product_id, v_row->>'product_name', v_original_url, COALESCE((v_row->>'current_price')::numeric, 0), v_status,
                        v_row->>'category', v_row->>'image_url', (v_row->>'old_price')::numeric, (v_row->>'score')::numeric, v_row->>'explainability', v_row->>'notes', (v_row->>'source_position')::int,
                        NOW(), NOW()
                    );
                    v_inserted := v_inserted + 1;
                END IF;

            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            -- Capturar erros de inserção/update em uma linha específica, ex: violação de constraint
            v_failed := v_failed + 1;
            -- Opcionalmente registrar notice: RAISE NOTICE 'Erro no item %: %', v_row->>'original_url', SQLERRM;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'marketplace', p_marketplace,
        'received', v_total,
        'inserted', v_inserted,
        'updated', v_updated,
        'ignored', v_ignored,
        'failed', v_failed,
        'state', 'success'
    );
END;
$$;

-- 4. GRANTS
-- Garantir que anon não pode executar se não for desejado
REVOKE ALL ON FUNCTION public.upsert_discovery_offers_v1(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_discovery_offers_v1(text, jsonb) FROM anon;

-- Liberar execução para autenticados e service_role
GRANT EXECUTE ON FUNCTION public.upsert_discovery_offers_v1(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_discovery_offers_v1(text, jsonb) TO service_role;
