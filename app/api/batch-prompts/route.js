/**
 * GET/POST /api/batch-prompts
 *
 * Generates 5 random crossmix prompts and returns them as JSON.
 * Designed for external applications to consume.
 *
 * Response shape:
 * {
 *   ok: true,
 *   prompts: [
 *     { index: 0, prompt: "...", input: { roomType, styleTags, furnitureTypes } },
 *     ...
 *   ]
 * }
 */

import { normalizeTag, parseTagList } from '@/lib/normalize';
import { getProductCatalog } from '@/lib/product-catalog';
import { getRoomOptions } from '@/lib/room-furniture';
import { findMasterRowByRoom, getMasterRows, getPresetBySlug, getRuleRows } from '@/lib/sheet-config';
import { isProductTypeMatch } from '@/lib/product-type-match';
import { getLocalImageCatalogByFurnitureType } from '@/lib/local-image-catalog';
import {
  mergeWeights,
  pickDeterministicProduct,
  scoreProductWithWeights,
  renderTemplate
} from '@/lib/prompt-generator';

const DEFAULT_PRESET_SLUG = 'living-room-corner-warm-minimal';
const BATCH_SIZE = 5;

function pickRandomSubset(items, min = 2, max = 4) {
  const source = [...new Set(items)].filter(Boolean);
  if (!source.length) return [];
  const lower = Math.max(1, Math.min(min, source.length));
  const upper = Math.max(lower, Math.min(max, source.length));
  const count = Math.floor(Math.random() * (upper - lower + 1)) + lower;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function computeCrossmixInput(roomOptions) {
  if (roomOptions.length < 2) return null;
  const shuffled = [...roomOptions].sort(() => Math.random() - 0.5);
  const rowA = shuffled[0];
  const rowB = shuffled[1];
  const tagsA = Array.isArray(rowA?.styleTags) ? rowA.styleTags.filter(Boolean) : [];
  const styleTag = tagsA.length ? tagsA[Math.floor(Math.random() * tagsA.length)] : '';
  const furnitureB = Array.isArray(rowB?.furnitureTypes) ? rowB.furnitureTypes.filter(Boolean) : [];
  return {
    roomType: rowA?.roomType || '',
    styleTags: styleTag ? [styleTag] : [],
    furnitureTypes: furnitureB.length ? pickRandomSubset(furnitureB, 2, 4) : []
  };
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
      : '',
    'Image instructions: The attached image(s) must be featured prominently in the scene. Render the exact piece(s) shown — do not substitute or reimagine them.'
  ]);
}

async function generateOnePrompt({ roomType, styleTags, furnitureTypes, seed, shared }) {
  const { masterRows, catalog, weights, presetSlug, preset } = shared;

  const requestedRoomType = normalizeTag(roomType || '');
  if (!requestedRoomType) return { error: 'No roomType resolved for this mix.' };

  const requestedStyleTags = parseTagList(styleTags || []);
  const requestedFurnitureTypes = parseTagList(furnitureTypes || []);

  const masterRow = findMasterRowByRoom(requestedRoomType, masterRows, '');
  if (masterRows.length && !masterRow) {
    return { error: `No master row for room "${requestedRoomType}".` };
  }

  const allEligibleProducts = catalog.products.filter((p) => p.image_url);
  const localCatalog = await getLocalImageCatalogByFurnitureType(requestedFurnitureTypes);

  const seedStr = [
    presetSlug,
    requestedRoomType,
    requestedStyleTags.join(','),
    String(seed)
  ].join('|');

  const selectedProducts = [];

  for (const furnitureType of requestedFurnitureTypes) {
    let matchingProducts = allEligibleProducts.filter((p) =>
      isProductTypeMatch(p.product_type, furnitureType)
    );

    if (!matchingProducts.length) {
      matchingProducts = localCatalog.byFurnitureType[furnitureType] || [];
    }

    if (!matchingProducts.length) continue;

    const pickedForType = pickDeterministicProduct({
      products: matchingProducts,
      category: '',
      subcategory: '',
      requestedStyleTags,
      weights,
      seed: `${seedStr}|${furnitureType}`
    });

    if (pickedForType.selected) {
      selectedProducts.push({ furnitureType, ...pickedForType.selected });
    }
  }

  // Fallback: pick any product if none matched
  if (!selectedProducts.length) {
    const fallback = pickDeterministicProduct({
      products: allEligibleProducts,
      category: '',
      subcategory: '',
      requestedStyleTags,
      weights,
      seed: `${seedStr}|fallback`
    });
    if (fallback.selected) {
      selectedProducts.push({ furnitureType: 'any', ...fallback.selected });
    }
  }

  const selected = selectedProducts[0] || null;
  const selectedProductsBullets = selectedProducts
    .map((item) => `- ${item.furnitureType}: ${item.product.title}`)
    .join('\n');

  let prompt = masterRow
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
          selected_products_titles: selectedProducts.map((i) => i.product.title).join(', '),
          product_id: selected?.product?.shopify_product_id || '',
          product_title: selected?.product?.title || '',
          product_handle: selected?.product?.handle || '',
          prompt_category: selected?.product?.prompt_category || '',
          prompt_subcategory: selected?.product?.prompt_subcategory || '',
          prompt_style_tags: parseTagList(selected?.product?.prompt_style_tags).join(', '),
          hero_descriptor: selected?.product?.hero_descriptor || '',
          image_url: ''
        })
      : '';

  if (!prompt) return { error: 'Unable to build prompt for this mix.' };

  if (/mirror/i.test(prompt)) {
    prompt +=
      '\nMirror reflection: The mirror should show a soft, realistic reflection — ambient light source visible, vague architectural depth, nothing distracting or specific.';
  }

  return {
    prompt,
    input: {
      roomType: requestedRoomType,
      styleTags: requestedStyleTags,
      furnitureTypes: requestedFurnitureTypes
    }
  };
}

async function handler(request) {
  try {
    // Allow a custom count via query param or body, capped at 20
    let count = BATCH_SIZE;
    const url = new URL(request.url);
    const countParam = url.searchParams.get('count');
    if (countParam) count = Math.min(20, Math.max(1, parseInt(countParam, 10) || BATCH_SIZE));

    const [roomData, masterRows, catalog, ruleRows, preset] = await Promise.all([
      getRoomOptions(),
      getMasterRows(),
      getProductCatalog(),
      getRuleRows(),
      getPresetBySlug(DEFAULT_PRESET_SLUG)
    ]);

    const roomOptions = roomData.roomOptions || [];
    if (roomOptions.length < 2) {
      return Response.json(
        { ok: false, error: 'Not enough room options loaded to generate crossmix prompts.' },
        { status: 500 }
      );
    }

    const weights = mergeWeights(ruleRows);
    const shared = { masterRows, catalog, weights, presetSlug: DEFAULT_PRESET_SLUG, preset };

    const results = [];
    for (let i = 0; i < count; i++) {
      const mix = computeCrossmixInput(roomOptions);
      if (!mix) {
        results.push({ index: i, error: 'Could not compute crossmix input.' });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const result = await generateOnePrompt({ ...mix, seed: i, shared });
      results.push({ index: i, ...result });
    }

    return Response.json(
      { ok: true, count: results.length, prompts: results },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to generate batch prompts' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return handler(request);
}

export async function POST(request) {
  return handler(request);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
