-- =======================================================
-- SCRIPT DE TESTE DE CATEGORIAS
-- Execute no SQL Editor do Supabase para validar a implementação
-- =======================================================

-- -------------------------------------------------------
-- TESTE 1: Contagem total de categorias e subcategorias
-- Esperado: 24 categorias principais, 153+ subcategorias, 177+ total
-- -------------------------------------------------------
SELECT
  COUNT(*) FILTER (WHERE parent_id IS NULL)  AS total_categorias_principais,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL) AS total_subcategorias,
  COUNT(*) AS total_geral
FROM public.categories;

-- -------------------------------------------------------
-- TESTE 2: Listagem hierárquica de categorias
-- Deve mostrar todas as 24 categorias com suas subcategorias
-- -------------------------------------------------------
SELECT
  CASE WHEN c.parent_id IS NULL THEN '📁 ' || c.name ELSE '  └── ' || c.name END AS estrutura,
  c.slug,
  CASE WHEN c.parent_id IS NULL THEN 'PRINCIPAL' ELSE 'subcategoria' END AS tipo
FROM public.categories c
LEFT JOIN public.categories p ON p.id = c.parent_id
ORDER BY
  COALESCE(p.display_order, c.display_order),
  CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
  c.display_order;

-- -------------------------------------------------------
-- TESTE 3: Verificar que todas as 24 categorias existem por nome
-- -------------------------------------------------------
SELECT name, slug, display_order
FROM public.categories
WHERE parent_id IS NULL
ORDER BY display_order;

-- -------------------------------------------------------
-- TESTE 4: Subcategorias por categoria principal
-- Deve mostrar contagem de subcategorias por categoria
-- -------------------------------------------------------
SELECT
  p.name AS categoria_principal,
  COUNT(c.id) AS total_subcategorias
FROM public.categories p
LEFT JOIN public.categories c ON c.parent_id = p.id
WHERE p.parent_id IS NULL
GROUP BY p.name, p.display_order
ORDER BY p.display_order;

-- -------------------------------------------------------
-- TESTE 5: Busca por categoria específica na tabela categories
-- Testa que o slug é encontrado
-- -------------------------------------------------------
SELECT id, name, slug, parent_id
FROM public.categories
WHERE slug IN (
  'telefonia',
  'games',
  'eletrodomesticos',
  'moda-beleza-e-perfumaria',
  'petshop',
  'saude',
  'informatica',
  'televisao'
);

-- -------------------------------------------------------
-- TESTE 6: Verificar coluna subcategory na tabela offers
-- Deve retornar sem erro (se a migration foi aplicada)
-- -------------------------------------------------------
SELECT
  id,
  product_name,
  category,
  subcategory,
  score
FROM public.offers
LIMIT 10;

-- -------------------------------------------------------
-- TESTE 7: Distribuição de categorias nas ofertas
-- Mostra o que realmente está no banco depois do scraping
-- -------------------------------------------------------
SELECT
  COALESCE(category, 'NULL / Sem categoria') AS categoria,
  COUNT(*) AS total_ofertas
FROM public.offers
GROUP BY category
ORDER BY total_ofertas DESC;

-- -------------------------------------------------------
-- TESTE 8: Distribuição de subcategorias nas ofertas
-- -------------------------------------------------------
SELECT
  COALESCE(category, 'NULL') AS categoria,
  COALESCE(subcategory, 'NULL') AS subcategoria,
  COUNT(*) AS total
FROM public.offers
GROUP BY category, subcategory
ORDER BY total DESC
LIMIT 30;

-- -------------------------------------------------------
-- TESTE 9: Busca por categoria "Telefonia" nas offers
-- Valida a função ilike do listOffersByCategory
-- -------------------------------------------------------
SELECT id, product_name, category, subcategory, platform, score
FROM public.offers
WHERE category ILIKE '%Telefonia%'
ORDER BY score DESC
LIMIT 10;

-- -------------------------------------------------------
-- TESTE 10: Busca por categoria "Games" nas offers
-- -------------------------------------------------------
SELECT id, product_name, category, subcategory, platform, score
FROM public.offers
WHERE category ILIKE '%Games%'
ORDER BY score DESC
LIMIT 10;

-- -------------------------------------------------------
-- TESTE 11: Busca por categoria "Eletrodomésticos" nas offers
-- -------------------------------------------------------
SELECT id, product_name, category, subcategory, platform, score
FROM public.offers
WHERE category ILIKE '%Eletrodom%'
ORDER BY score DESC
LIMIT 10;

-- -------------------------------------------------------
-- TESTE 12: Busca de categorias no catálogo pela subcategoria
-- Simula a normalizeCategory("iPhone 15")
-- -------------------------------------------------------
SELECT
  p.name AS categoria_principal,
  c.name AS subcategoria,
  c.slug
FROM public.categories c
JOIN public.categories p ON p.id = c.parent_id
WHERE
  c.name ILIKE '%iPhone%'
  OR c.name ILIKE '%Samsung%'
  OR c.name ILIKE '%Notebook%'
  OR c.name ILIKE '%Air Fryer%'
  OR c.name ILIKE '%Fritadeira%'
  OR c.name ILIKE '%Geladeira%'
  OR c.name ILIKE '%PlayStation%';

-- -------------------------------------------------------
-- RESULTADO ESPERADO DOS TESTES
-- -------------------------------------------------------
-- TESTE 1: total_categorias_principais=24, total_subcategorias=153, total_geral=177
-- TESTE 3: 24 linhas com as categorias em ordem de display_order
-- TESTE 4: Cada categoria deve ter pelo menos 1 subcategoria
-- TESTE 5: 8 linhas retornadas (todas as categorias testadas existem)
-- TESTE 6: Retorna sem erro — coluna subcategory existe
-- TESTE 12: Retorna todas as subcategorias de busca mapeadas para a categoria principal correta
