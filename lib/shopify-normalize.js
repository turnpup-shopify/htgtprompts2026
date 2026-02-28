import { normalizeTag, parseTagList, firstNonEmpty, parsePromptTags } from './normalize';

function parseInventory(totalInventory) {
  const numeric = Number(totalInventory);
  return Number.isFinite(numeric) && numeric > 0;
}

function buildImageOptions(item) {
  const urls = [];
  const seen = new Set();

  function push(url) {
    const normalized = String(url || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    urls.push(normalized);
  }

  push(item.featuredImage?.url);

  const edges = item.images?.edges || [];
  for (const edge of edges) {
    push(edge?.node?.url);
  }

  return urls;
}

export function normalizeShopifyProduct(item) {
  const promptTags = parsePromptTags(item.tags || []);

  const promptCategory = firstNonEmpty(item.promptCategory?.value, promptTags.category).toLowerCase();
  const promptSubcategory = firstNonEmpty(
    item.promptSubcategory?.value,
    promptTags.subcategory
  ).toLowerCase();
  const heroDescriptor = firstNonEmpty(item.promptHeroDescriptor?.value, promptTags.heroDescriptor);
  const promptStyleTags = parseTagList(
    firstNonEmpty(item.promptStyleTags?.value, promptTags.styleTags.join(','))
  );

  return {
    shopify_product_id: String(item.id),
    title: item.title,
    handle: item.handle || null,
    product_type: normalizeTag(item.productType),
    prompt_category: promptCategory || null,
    prompt_subcategory: promptSubcategory || null,
    prompt_style_tags: promptStyleTags,
    hero_descriptor: heroDescriptor || null,
    image_url: firstNonEmpty(item.featuredImage?.url) || null,
    image_options: buildImageOptions(item),
    in_stock: parseInventory(item.totalInventory)
  };
}
