import { fetchCsvObjects } from './csv';
import { normalizeTag, parseTagList, firstNonEmpty } from './normalize';
import { resolveSheetCsvUrl } from './sheets-url';
import { fetchAllActiveProducts } from './shopify';
import { normalizeShopifyProduct } from './shopify-normalize';

function parseBoolean(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'in stock', 'instock'].includes(normalized);
}

function parseListRaw(value) {
  return String(value || '')
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function getField(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && String(record[key]).trim() !== '') {
      return record[key];
    }
  }

  return '';
}

function normalizeSheetProduct(record) {
  const handle = normalizeTag(getField(record, ['handle', 'product_handle']));
  const title = String(getField(record, ['title', 'name']) || '').trim();
  const productType = normalizeTag(getField(record, ['product_type', 'furniture_type']));
  const status = normalizeTag(getField(record, ['status']));

  if (!title || !productType) return null;
  if (status && status !== 'active') return null;

  const productId = String(
    getField(record, ['shopify_product_id', 'product_id', 'id']) || `sheet:${handle || title}`
  ).trim();

  const imageUrl = String(getField(record, ['image_url', 'image']) || '').trim();
  const imageOptions = parseListRaw(getField(record, ['image_options']));

  return {
    shopify_product_id: productId,
    title,
    handle: handle || null,
    product_type: productType,
    prompt_category: normalizeTag(
      getField(record, ['prompt_category', 'category', 'room_type'])
    ) || null,
    prompt_subcategory: normalizeTag(getField(record, ['prompt_subcategory', 'subcategory'])) || null,
    prompt_style_tags: parseTagList(getField(record, ['prompt_style_tags', 'style_tags'])),
    hero_descriptor: firstNonEmpty(getField(record, ['hero_descriptor'])) || null,
    image_url: imageUrl || null,
    image_options: imageOptions.length ? imageOptions : imageUrl ? [imageUrl] : [],
    in_stock: parseBoolean(getField(record, ['in_stock', 'available', 'stock']))
  };
}

export function getProductCatalogSource() {
  const source = normalizeTag(process.env.PRODUCT_CATALOG_SOURCE || 'sheets');
  return source === 'shopify' ? 'shopify' : 'sheets';
}

async function getProductsFromSheets() {
  const url = resolveSheetCsvUrl('products', process.env.PRODUCTS_CSV_URL);
  if (!url) {
    throw new Error(
      'Missing product catalog source. Set GOOGLE_SHEETS_CSV_URL (with a "products" tab) or PRODUCTS_CSV_URL.'
    );
  }

  const { records } = await fetchCsvObjects(url);
  const products = records.map(normalizeSheetProduct).filter(Boolean);
  return { source: 'sheets', products };
}

async function getProductsFromShopify() {
  const activeProducts = await fetchAllActiveProducts();
  return {
    source: 'shopify',
    products: activeProducts.map(normalizeShopifyProduct)
  };
}

export async function getProductCatalog() {
  return getProductCatalogSource() === 'shopify'
    ? getProductsFromShopify()
    : getProductsFromSheets();
}
