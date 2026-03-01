const DEFAULT_BLOB_PREFIX = 'items';

export function normalizePrefix(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

export function normalizePathname(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/g, '')
    .replace(/\/+/g, '/');
}

export function getBlobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN || undefined;
}

export function getDefaultBlobPrefix() {
  const configured = process.env.PRODUCT_IMAGE_BLOB_PREFIX;
  const value = configured === undefined ? DEFAULT_BLOB_PREFIX : String(configured);
  return normalizePrefix(value);
}

export async function loadBlobModule() {
  try {
    return await import('@vercel/blob');
  } catch (error) {
    const message =
      error && typeof error.message === 'string'
        ? error.message
        : 'Unable to load @vercel/blob at runtime.';
    throw new Error(`Missing @vercel/blob dependency. ${message}`);
  }
}

export async function listAllBlobs({ blobModule, prefix = '', token }) {
  const normalizedPrefix = normalizePrefix(prefix);
  const scopedPrefix = normalizedPrefix ? `${normalizedPrefix}/` : undefined;
  const blobs = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await blobModule.list({
      cursor,
      limit: 1000,
      prefix: scopedPrefix,
      token
    });

    blobs.push(...(page.blobs || []));

    if (page.hasMore && page.cursor) {
      cursor = page.cursor;
      continue;
    }

    hasMore = false;
  }

  return blobs;
}

export async function findBlobByPathname({ blobModule, pathname, token }) {
  const normalizedPathname = normalizePathname(pathname);
  if (!normalizedPathname) return null;

  const page = await blobModule.list({
    prefix: normalizedPathname,
    limit: 1000,
    token
  });

  return (
    (page.blobs || []).find(
      (item) => normalizePathname(String(item.pathname || '')) === normalizedPathname
    ) || null
  );
}
