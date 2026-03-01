import { normalizeTag, parseTagList } from '@/lib/normalize';
import { getProductCatalog } from '@/lib/product-catalog';
import { getRoomOptions } from '@/lib/room-furniture';
import {
  findMasterRowByRoom,
  getMasterRows,
  getPresetBySlug,
  getRuleRows
} from '@/lib/sheet-config';
import { isProductTypeMatch } from '@/lib/product-type-match';
import { getLocalImageCatalogByFurnitureType } from '@/lib/local-image-catalog';
import {
  mergeWeights,
  pickDeterministicProduct,
  scoreProductWithWeights,
  renderTemplate
} from '@/lib/prompt-generator';

const DEFAULT_PRESET_SLUG = 'living-room-corner-warm-minimal';

function pickRandomSubset(items, min = 2, max = 4) {
  const source = [...new Set(items)].filter(Boolean);
  if (!source.length) return [];

  const lower = Math.max(1, Math.min(min, source.length));
  const upper = Math.max(lower, Math.min(max, source.length));
  const count = Math.floor(Math.random() * (upper - lower + 1)) + lower;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function resolveFurnitureTypesFromBody(value) {
  if (Array.isArray(value)) return parseTagList(value);
  if (typeof value === 'string') return parseTagList(value);
  return [];
}

function resolveFeaturedProductsByType(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result = {};

  for (const [key, productId] of Object.entries(value)) {
    const normalizedKey = normalizeTag(key);
    const normalizedId = String(productId || '').trim();
    if (!normalizedKey || !normalizedId) continue;
    result[normalizedKey] = normalizedId;
  }

  return result;
}

function joinPromptSections(sections = []) {
  return sections
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function buildPromptFromMasterRow({
  masterRow,
  requestedRoomType,
  requestedStyleTags,
  requestedFurnitureTypes,
  selectedProducts,
  selected
}) {
  const styleTags = requestedStyleTags.length ? requestedStyleTags : masterRow.style_tags || [];
  const selectedProductsBullets = selectedProducts
    .map((item) => `- ${item.furnitureType}: ${item.product.title}`)
    .join('\n');

  return joinPromptSections([
    `Room: ${masterRow.room || requestedRoomType}`,
    masterRow.room_details ? `Room details:\n${masterRow.room_details}` : '',
    masterRow.furniture_decor ? `Furniture decor:\n${masterRow.furniture_decor}` : '',
    masterRow.materials ? `Materials:\n${masterRow.materials}` : '',
    masterRow.lighting ? `Lighting:\n${masterRow.lighting}` : '',
    masterRow.camera ? `Camera:\n${masterRow.camera}` : '',
    masterRow.color_grade ? `Color grade:\n${masterRow.color_grade}` : '',
    masterRow.negative_styling_rules
      ? `Negative styling rules:\n${masterRow.negative_styling_rules}`
      : '',
    masterRow.hero_object_placement_logic
      ? `Hero object placement logic:\n${masterRow.hero_object_placement_logic}`
      : '',
    masterRow.realism_constraints ? `Realism constraints:\n${masterRow.realism_constraints}` : '',
    requestedFurnitureTypes.length
      ? `Furniture types: ${requestedFurnitureTypes.join(', ')}`
      : '',
    styleTags.length ? `Style tags: ${styleTags.join(', ')}` : '',
    selectedProductsBullets ? `Selected products:\n${selectedProductsBullets}` : '',
    selected?.product?.title ? `Primary selected product: ${selected.product.title}` : '',
    selected?.product?.hero_descriptor
      ? `Primary product hero descriptor: ${selected.product.hero_descriptor}`
      : ''
  ]);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const presetSlug = body.presetSlug || DEFAULT_PRESET_SLUG;
    const preset = await getPresetBySlug(presetSlug);

    const requestedRoomType = normalizeTag(
      body.roomType || body.category || preset?.default_category || ''
    );
    if (!requestedRoomType) {
      return Response.json(
        { ok: false, error: 'roomType (or category) is required.' },
        { status: 400 }
      );
    }

    const masterRows = await getMasterRows();
    const masterRow = findMasterRowByRoom(requestedRoomType, masterRows);

    if (masterRows.length && !masterRow) {
      return Response.json(
        {
          ok: false,
          error: `No matching row in 'master' tab for roomType "${requestedRoomType}".`,
          availableRooms: masterRows.map((row) => row.room)
        },
        { status: 404 }
      );
    }

    const hasExplicitStyleTags = Array.isArray(body.styleTags)
      ? body.styleTags.length > 0
      : typeof body.styleTags === 'string'
        ? body.styleTags.trim().length > 0
        : false;
    const requestedStyleTags = parseTagList(
      hasExplicitStyleTags
        ? body.styleTags
        : masterRow?.style_tags?.length
          ? masterRow.style_tags
          : preset?.default_style_tags
    );

    let requestedFurnitureTypes = resolveFurnitureTypesFromBody(
      body.furnitureTypes || body.furniture
    );
    const featuredProductsByType = resolveFeaturedProductsByType(body.featuredProductsByType);
    let autoSelectedFurnitureTypes = false;

    if (!requestedFurnitureTypes.length) {
      const roomData = await getRoomOptions().catch(() => ({ roomOptions: [] }));
      const roomMatch = roomData.roomOptions.find(
        (item) => normalizeTag(item.roomType) === requestedRoomType
      );

      if (roomMatch?.furnitureTypes?.length) {
        requestedFurnitureTypes = pickRandomSubset(roomMatch.furnitureTypes, 2, 4);
        autoSelectedFurnitureTypes = true;
      }
    }

    const catalog = await getProductCatalog();
    const normalizedProducts = catalog.products;
    const allEligibleProducts = normalizedProducts;
    const localCatalog = await getLocalImageCatalogByFurnitureType(requestedFurnitureTypes);

    const weights = mergeWeights(await getRuleRows());
    const seed = [
      preset?.slug || String(presetSlug || DEFAULT_PRESET_SLUG),
      requestedRoomType,
      requestedStyleTags.join(',')
    ].join('|');

    const selectedProducts = [];
    const debugByFurnitureType = [];
    const unmatchedFurnitureTypes = [];
    const localFallbackUsedFor = [];

    for (const furnitureType of requestedFurnitureTypes) {
      let matchingProducts = allEligibleProducts.filter(
        (product) => isProductTypeMatch(product.product_type, furnitureType)
      );

      if (!matchingProducts.length) {
        matchingProducts = localCatalog.byFurnitureType[furnitureType] || [];
        if (matchingProducts.length) {
          localFallbackUsedFor.push(furnitureType);
        }
      }

      if (!matchingProducts.length) {
        unmatchedFurnitureTypes.push(furnitureType);
        debugByFurnitureType.push({ furnitureType, matchedProducts: 0, picked: null });
        continue;
      }

      const manualProductId = featuredProductsByType[furnitureType];
      const manualProduct = matchingProducts.find(
        (product) => product.shopify_product_id === manualProductId
      );

      if (manualProduct) {
        const manualScore = scoreProductWithWeights(manualProduct, requestedStyleTags, weights);
        selectedProducts.push({ furnitureType, ...manualScore, manualSelection: true });
        debugByFurnitureType.push({
          furnitureType,
          matchedProducts: matchingProducts.length,
          selection_mode: 'manual',
          selected_product_id: manualProduct.shopify_product_id,
          selected_product_title: manualProduct.title
        });
        continue;
      }

      const pickedForType = pickDeterministicProduct({
        products: matchingProducts,
        category: '',
        subcategory: '',
        requestedStyleTags,
        weights,
        seed: `${seed}|${furnitureType}`
      });

      if (!pickedForType.selected) {
        unmatchedFurnitureTypes.push(furnitureType);
        debugByFurnitureType.push({
          furnitureType,
          matchedProducts: matchingProducts.length,
          picked: null
        });
        continue;
      }

      selectedProducts.push({ furnitureType, ...pickedForType.selected });
      debugByFurnitureType.push({
        furnitureType,
        matchedProducts: matchingProducts.length,
        selection_mode: 'deterministic',
        reason: pickedForType.reason,
        fallback_used: pickedForType.fallbackUsed,
        selected_product_id: pickedForType.selected.product.shopify_product_id,
        selected_product_title: pickedForType.selected.product.title
      });
    }

    if (!selectedProducts.length) {
      const allLocalFallbackProducts = requestedFurnitureTypes.flatMap(
        (type) => localCatalog.byFurnitureType[type] || []
      );

      const fallbackPick = pickDeterministicProduct({
        products: [...allEligibleProducts, ...allLocalFallbackProducts],
        category: '',
        subcategory: '',
        requestedStyleTags,
        weights,
        seed: `${seed}|fallback`
      });

      if (fallbackPick.selected) {
        selectedProducts.push({ furnitureType: 'any', ...fallbackPick.selected });
      }
    }

    if (!selectedProducts.length) {
      return Response.json(
        {
          ok: false,
          error: 'No matching product found after scoring. Check `products` sheet or your image catalog source.'
        },
        { status: 404 }
      );
    }

    const selected = selectedProducts[0];
    const selectedProductsBullets = selectedProducts
      .map((item) => `- ${item.furnitureType}: ${item.product.title}`)
      .join('\n');
    const prompt = masterRow
      ? buildPromptFromMasterRow({
          masterRow,
          requestedRoomType,
          requestedStyleTags,
          requestedFurnitureTypes,
          selectedProducts,
          selected
        })
      : preset?.prompt_template
        ? renderTemplate(preset.prompt_template, {
            preset_slug: preset.slug,
            preset_name: preset.name,
            room_type: requestedRoomType,
            requested_category: requestedRoomType,
            requested_subcategory: '',
            requested_style_tags: requestedStyleTags.join(', '),
            selected_furniture_types: requestedFurnitureTypes.join(', '),
            selected_products_bullets: selectedProductsBullets,
            selected_products_titles: selectedProducts.map((item) => item.product.title).join(', '),
            product_id: selected.product.shopify_product_id,
            product_title: selected.product.title,
            product_handle: selected.product.handle,
            prompt_category: selected.product.prompt_category,
            prompt_subcategory: selected.product.prompt_subcategory,
            prompt_style_tags: parseTagList(selected.product.prompt_style_tags).join(', '),
            hero_descriptor: selected.product.hero_descriptor,
            image_url: ''
          })
        : '';

    if (!prompt) {
      return Response.json(
        { ok: false, error: 'Unable to build prompt. Check `master` tab or preset template data.' },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      preset: preset ? { slug: preset.slug, name: preset.name } : null,
      master: masterRow
        ? {
            room: masterRow.room,
            style_tags: masterRow.style_tags
          }
        : null,
      input: {
        roomType: requestedRoomType,
        category: requestedRoomType,
        styleTags: requestedStyleTags,
        furnitureTypes: requestedFurnitureTypes,
        featuredProductsByType
      },
      prompt,
      selectedProduct: {
        shopify_product_id: selected.product.shopify_product_id,
        title: selected.product.title,
        handle: selected.product.handle,
        product_type: selected.product.product_type,
        prompt_category: selected.product.prompt_category,
        prompt_subcategory: selected.product.prompt_subcategory,
        prompt_style_tags: selected.product.prompt_style_tags,
        hero_descriptor: selected.product.hero_descriptor,
        image_url: selected.product.image_url,
        image_options: selected.product.image_options || [],
        in_stock: selected.product.in_stock
      },
      selectedProducts: selectedProducts.map((item) => ({
        furniture_type: item.furnitureType,
        total_score: item.total,
        breakdown: item.breakdown,
        matched_style_tags: item.matchedStyleTags,
        shopify_product_id: item.product.shopify_product_id,
        title: item.product.title,
        handle: item.product.handle,
        product_type: item.product.product_type,
        prompt_category: item.product.prompt_category,
        prompt_subcategory: item.product.prompt_subcategory,
        prompt_style_tags: item.product.prompt_style_tags,
        hero_descriptor: item.product.hero_descriptor,
        image_url: item.product.image_url,
        image_options: item.product.image_options || [],
        in_stock: item.product.in_stock
      })),
      scoreBreakdown: {
        total: selected.total,
        ...selected.breakdown,
        matched_style_tags: selected.matchedStyleTags
      },
      debug: {
        data_source: `${catalog.source}_plus_google_sheets`,
        image_catalog_source: localCatalog.storageSource,
        total_active_products: normalizedProducts.length,
        eligible_products_considered: allEligibleProducts.length,
        room_category_filter_applied: false,
        auto_selected_furniture_types: autoSelectedFurnitureTypes,
        local_fallback_used_for: localFallbackUsedFor,
        unmatched_furniture_types: unmatchedFurnitureTypes,
        furniture_type_debug: debugByFurnitureType,
        master_row: masterRow?.room || null,
        weights
      }
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to generate prompt' },
      { status: 500 }
    );
  }
}
