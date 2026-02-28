import { fetchAllActiveProducts } from '@/lib/shopify';
import { normalizeShopifyProduct } from '@/lib/shopify-normalize';
import { normalizeTag } from '@/lib/normalize';
import { getProductCatalogSource } from '@/lib/product-catalog';

function toInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function countBy(list, keyFn) {
  const map = new Map();

  for (const item of list) {
    const key = keyFn(item) || 'unknown';
    map.set(key, (map.get(key) || 0) + 1);
  }

  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

export async function GET(request) {
  try {
    const source = getProductCatalogSource();

    if (source !== 'shopify') {
      return Response.json({
        ok: false,
        source,
        error:
          'Shopify debug is disabled while PRODUCT_CATALOG_SOURCE is not "shopify".'
      });
    }

    const { searchParams } = new URL(request.url);
    const productType = normalizeTag(searchParams.get('productType'));
    const limit = toInt(searchParams.get('limit'), 25);

    const activeProducts = await fetchAllActiveProducts();
    const normalized = activeProducts.map(normalizeShopifyProduct);

    let filtered = normalized;
    if (productType) {
      filtered = filtered.filter((item) => normalizeTag(item.product_type) === productType);
    }

    return Response.json({
      ok: true,
      source,
      filters: {
        productType: productType || null,
        limit
      },
      counts: {
        total_active_products: normalized.length,
        filtered_products: filtered.length
      },
      top_product_types: countBy(normalized, (item) => normalizeTag(item.product_type)).slice(0, 20),
      top_prompt_categories: countBy(normalized, (item) => normalizeTag(item.prompt_category)).slice(0, 20),
      sample_products: filtered.slice(0, limit)
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error.message || 'Failed to debug Shopify products'
      },
      { status: 500 }
    );
  }
}
