import { normalizeTag, parseTagList } from '@/lib/normalize';
import { getProductCatalog } from '@/lib/product-catalog';
import { isProductTypeMatch } from '@/lib/product-type-match';
import { getLocalImageCatalogByFurnitureType } from '@/lib/local-image-catalog';

function resolveFurnitureTypes(value) {
  if (Array.isArray(value)) return parseTagList(value);
  if (typeof value === 'string') return parseTagList(value);
  return [];
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const roomType = normalizeTag(body.roomType || body.category);
    const furnitureTypes = resolveFurnitureTypes(body.furnitureTypes || body.furniture);

    if (!furnitureTypes.length) {
      return Response.json(
        { ok: false, error: 'furnitureTypes is required.' },
        { status: 400 }
      );
    }

    const catalog = await getProductCatalog();
    const normalized = catalog.products;
    const localCatalog = await getLocalImageCatalogByFurnitureType(furnitureTypes);

    const optionsByFurnitureType = {};
    const localFallbackUsedFor = [];

    for (const furnitureType of furnitureTypes) {
      let options = normalized
        .filter((item) => isProductTypeMatch(item.product_type, furnitureType))
        .sort((a, b) => String(a.title).localeCompare(String(b.title)))
        .map((item) => ({
          shopify_product_id: item.shopify_product_id,
          title: item.title,
          handle: item.handle,
          product_type: item.product_type,
          image_url: item.image_url,
          image_options: item.image_options || [],
          image_option_details: (item.image_options || []).map((filePath) => ({
            fileName: String(filePath || '').split('/').pop() || '',
            filePath,
            relativePath: null,
            relativeFolder: null
          })),
          prompt_subcategory: item.prompt_subcategory,
          in_stock: item.in_stock,
          catalog_origin: catalog.source
        }));

      if (!options.length) {
        const localOptions = localCatalog.byFurnitureType[furnitureType] || [];
        if (localOptions.length) {
          options = localOptions.map((item) => ({
            shopify_product_id: item.shopify_product_id,
            title: item.title,
            handle: item.handle,
            product_type: item.product_type,
            image_url: item.image_url,
            image_options: item.image_options || [],
            image_option_details: item.image_option_details || [],
            prompt_subcategory: item.prompt_subcategory,
            in_stock: item.in_stock,
            local_only: localCatalog.storageSource === 'local',
            catalog_origin: localCatalog.storageSource
          }));
          localFallbackUsedFor.push(furnitureType);
        }
      }

      optionsByFurnitureType[furnitureType] = options;
    }

    return Response.json({
      ok: true,
      input: { roomType, furnitureTypes },
      counts: {
        active_products: normalized.length
      },
      filters: {
        room_category_filter_applied: false
      },
      source: catalog.source,
      imageCatalogSource: localCatalog.storageSource,
      localFallbackUsedFor,
      optionsByFurnitureType
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to load product options' },
      { status: 500 }
    );
  }
}
