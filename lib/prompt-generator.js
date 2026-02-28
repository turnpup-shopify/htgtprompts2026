import { parseTagList, normalizeTag } from './normalize';

const DEFAULT_WEIGHTS = {
  style_match: 50,
  hero_descriptor: 10,
  image: 10,
  in_stock: 10
};

function stableHash(text) {
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function cleanText(value) {
  return String(value || '').trim();
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function mergeWeights(ruleRows = []) {
  const merged = { ...DEFAULT_WEIGHTS };

  for (const row of ruleRows) {
    if (row.rule_key in merged) {
      merged[row.rule_key] = Number(row.weight_int) || merged[row.rule_key];
    }
  }

  return merged;
}

function scoreProduct(product, requestedStyles, weights) {
  const productStyleTags = parseTagList(product.prompt_style_tags);
  const matchedStyleTags = requestedStyles.filter((tag) => productStyleTags.includes(tag));
  const hasStyleMatch = matchedStyleTags.length > 0;

  const styleScore = hasStyleMatch ? weights.style_match : 0;
  const heroScore = cleanText(product.hero_descriptor) ? weights.hero_descriptor : 0;
  const imageScore = cleanText(product.image_url) ? weights.image : 0;
  const stockScore = toBoolean(product.in_stock) ? weights.in_stock : 0;

  return {
    product,
    styleMatched: hasStyleMatch,
    matchedStyleTags,
    breakdown: {
      style_match: styleScore,
      hero_descriptor: heroScore,
      image: imageScore,
      in_stock: stockScore
    },
    total: styleScore + heroScore + imageScore + stockScore
  };
}

export function scoreProductWithWeights(product, requestedStyles, weights) {
  return scoreProduct(product, parseTagList(requestedStyles), weights);
}

function rankProducts(scored, seed) {
  return [...scored].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;

    const hashA = stableHash(`${seed}:${a.product.shopify_product_id}`);
    const hashB = stableHash(`${seed}:${b.product.shopify_product_id}`);

    if (hashA !== hashB) return hashA - hashB;

    return String(a.product.shopify_product_id).localeCompare(String(b.product.shopify_product_id));
  });
}

export function renderTemplate(template, values) {
  // Support templates saved with literal "\n" as well as real line breaks.
  const normalizedTemplate = String(template || '').replace(/\\n/g, '\n');
  const lines = normalizedTemplate.split(/\r?\n/);
  const rendered = [];

  for (const line of lines) {
    const matches = [...line.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)];

    if (!matches.length) {
      rendered.push(line);
      continue;
    }

    let shouldOmitLine = false;
    let result = line;

    for (const match of matches) {
      const key = match[1];
      const value = cleanText(values[key]);

      if (!value) {
        shouldOmitLine = true;
        break;
      }

      result = result.replace(match[0], value);
    }

    if (!shouldOmitLine) {
      rendered.push(result);
    }
  }

  return rendered.join('\n').trim();
}

export function pickDeterministicProduct({
  products,
  category,
  subcategory,
  requestedStyleTags,
  weights,
  seed
}) {
  const normalizedStyles = parseTagList(requestedStyleTags);
  const normalizedCategory = normalizeTag(category);
  const normalizedSubcategory = normalizeTag(subcategory);

  const categoryProducts = normalizedCategory
    ? products.filter((item) => normalizeTag(item.prompt_category) === normalizedCategory)
    : [...products];

  let workingSet = categoryProducts;

  if (normalizedSubcategory) {
    const subcategoryProducts = categoryProducts.filter(
      (item) => normalizeTag(item.prompt_subcategory) === normalizedSubcategory
    );

    if (subcategoryProducts.length > 0) {
      workingSet = subcategoryProducts;
    }
  }

  if (!workingSet.length) {
    return {
      selected: null,
      ranked: [],
      fallbackUsed: true,
      reason: 'No products found for the requested category/subcategory.'
    };
  }

  const scoredWorkingSet = workingSet.map((item) => scoreProduct(item, normalizedStyles, weights));
  const styleMatched = scoredWorkingSet.filter((item) => item.styleMatched);

  const fallbackToAnyCategory = normalizedStyles.length > 0 && styleMatched.length === 0;
  const selectedPool = fallbackToAnyCategory
    ? categoryProducts.map((item) => scoreProduct(item, normalizedStyles, weights))
    : scoredWorkingSet;

  const ranked = rankProducts(selectedPool, seed);

  return {
    selected: ranked[0] || null,
    ranked,
    fallbackUsed: fallbackToAnyCategory,
    reason: fallbackToAnyCategory
      ? 'No style match in the initial set, fell back to any product in category.'
      : normalizedCategory
        ? 'Selected from requested category/subcategory using deterministic scoring.'
        : 'Selected from requested pool using deterministic scoring.'
  };
}
