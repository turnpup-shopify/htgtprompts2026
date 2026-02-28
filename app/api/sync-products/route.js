import { getProductCatalog, getProductCatalogSource } from '@/lib/product-catalog';

export async function POST() {
  try {
    const source = getProductCatalogSource();

    if (source !== 'shopify') {
      return Response.json({
        ok: true,
        source,
        pulled: 0,
        message:
          'Shopify integration is available but disabled. Set PRODUCT_CATALOG_SOURCE=shopify to use it.'
      });
    }

    const catalog = await getProductCatalog();

    return Response.json({
      ok: true,
      source,
      pulled: catalog.products.length,
      message:
        'No database mode is active. Products are currently read live from Shopify.'
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Shopify pull failed' },
      { status: 500 }
    );
  }
}
