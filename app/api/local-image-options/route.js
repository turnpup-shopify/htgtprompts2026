import { normalizeTag } from '@/lib/normalize';
import { getLocalImageCatalogByFurnitureType } from '@/lib/local-image-catalog';

export const runtime = 'nodejs';

function sanitizeHandle(handle) {
  return String(handle || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const productHandle = sanitizeHandle(body.productHandle);
    const furnitureType = normalizeTag(body.furnitureType);

    const localCatalog = await getLocalImageCatalogByFurnitureType(
      furnitureType ? [furnitureType] : []
    );
    const typeProducts = furnitureType ? localCatalog.byFurnitureType[furnitureType] || [] : [];

    let options = [];
    let matchMode = 'none';
    const storageSource = localCatalog.storageSource || 'local';
    const storageRoot = storageSource === 'blob' ? localCatalog.blobPrefix : localCatalog.imageDir;

    function toOptionFromDetails(detail) {
      return {
        fileName: detail?.fileName || String(detail?.filePath || '').split('/').pop() || '',
        filePath: detail?.filePath || '',
        relativePath: detail?.relativePath || null,
        relativeFolder: detail?.relativeFolder || null
      };
    }

    if (typeProducts.length > 0) {
      const byHandle = productHandle
        ? typeProducts.find((item) => item.handle === productHandle)
        : null;

      if (byHandle) {
        options = (byHandle.image_option_details || []).map(toOptionFromDetails);
        if (!options.length) {
          options = (byHandle.image_options || []).map((filePath) =>
            toOptionFromDetails({ filePath })
          );
        }
        matchMode = 'product_handle';
      } else {
        options = typeProducts.flatMap((item) =>
          (item.image_option_details || []).map(toOptionFromDetails)
        );
        if (!options.length) {
          options = typeProducts.flatMap((item) =>
            (item.image_options || []).map((filePath) => toOptionFromDetails({ filePath }))
          );
        }
        matchMode = 'furniture_folder';
      }
    }

    return Response.json({
      ok: true,
      productHandle: productHandle || null,
      furnitureType: furnitureType || null,
      storageSource,
      storageRoot,
      matchMode,
      options,
      counts: {
        total_images: localCatalog.allImageCount,
        matching_images: options.length
      }
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to load local image options.' },
      { status: 500 }
    );
  }
}
