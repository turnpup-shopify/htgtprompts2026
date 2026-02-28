import os from 'os';
import path from 'path';
import { readdir } from 'fs/promises';
import { normalizeTag } from './normalize';

const DEFAULT_IMAGE_DIR =
  '~/Library/Mobile Documents/com~apple~CloudDocs/Pictures-Htgt/Items';
const DEFAULT_BLOB_PREFIX = 'items';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function expandHome(inputPath) {
  if (!inputPath) return '';
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function singularizeWord(word) {
  const value = String(word || '');
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith('es') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('s') && value.length > 3) return value.slice(0, -1);
  return value;
}

function singularizePhrase(value) {
  return normalizeName(value)
    .split('-')
    .map(singularizeWord)
    .join('-');
}

export function isLooseFolderMatch(folderValue, furnitureType) {
  const normalizedFolder = normalizeName(folderValue);
  const normalizedType = normalizeName(furnitureType);
  if (!normalizedFolder || !normalizedType) return false;
  if (normalizedFolder === normalizedType) return true;
  if (singularizePhrase(normalizedFolder) === singularizePhrase(normalizedType)) return true;
  if (normalizedFolder.includes(normalizedType)) return true;
  if (normalizedType.includes(normalizedFolder)) return true;
  return false;
}

function isImageFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function normalizeStorageSource(value) {
  const normalized = normalizeTag(value || '');
  return normalized === 'blob' ? 'blob' : 'local';
}

export function getImageStorageSource() {
  return normalizeStorageSource(process.env.PRODUCT_IMAGE_SOURCE || 'local');
}

function getBlobPrefix() {
  return String(process.env.PRODUCT_IMAGE_BLOB_PREFIX || DEFAULT_BLOB_PREFIX)
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

async function collectImagesRecursive(baseDir, relativeDir = '') {
  const currentDir = relativeDir ? path.join(baseDir, relativeDir) : baseDir;
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const childRelative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectImagesRecursive(baseDir, childRelative);
      files.push(...nested);
      continue;
    }

    if (!entry.isFile() || !isImageFile(entry.name)) continue;

    const fullPath = path.join(baseDir, childRelative);
    const relativePath = childRelative;
    const relativeFolder = path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath);
    const baseName = path.basename(entry.name, path.extname(entry.name));

    files.push({
      fileName: entry.name,
      filePath: fullPath,
      relativePath,
      relativeFolder,
      normalizedBaseName: normalizeName(baseName)
    });
  }

  return files;
}

async function listBlobImages(prefix) {
  let blobModule;

  try {
    blobModule = await import('@vercel/blob');
  } catch (error) {
    const message =
      error && typeof error.message === 'string'
        ? error.message
        : 'Unable to load @vercel/blob at runtime.';
    throw new Error(`Missing @vercel/blob dependency. ${message}`);
  }

  const token =
    process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN || undefined;
  const scopedPrefix = prefix ? `${prefix}/` : '';
  const files = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await blobModule.list({
      cursor,
      limit: 1000,
      prefix: scopedPrefix || undefined,
      token
    });

    for (const blob of page.blobs || []) {
      const pathname = String(blob.pathname || '').trim();
      if (!pathname) continue;

      const fileName = pathname.split('/').pop() || '';
      if (!isImageFile(fileName)) continue;

      const relativePath =
        scopedPrefix && pathname.startsWith(scopedPrefix)
          ? pathname.slice(scopedPrefix.length)
          : pathname;
      const parts = relativePath.split('/').filter(Boolean);
      const relativeFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      const baseName = path.basename(fileName, path.extname(fileName));

      files.push({
        fileName,
        filePath: blob.url,
        relativePath,
        relativeFolder,
        normalizedBaseName: normalizeName(baseName)
      });
    }

    if (page.hasMore && page.cursor) {
      cursor = page.cursor;
      continue;
    }

    hasMore = false;
  }

  return files;
}

function deriveHandleFromFile(file, furnitureType) {
  const parts = String(file.relativePath || '')
    .split(/[\\/]/)
    .filter(Boolean);
  const normalizedType = normalizeName(furnitureType);
  const matchedFolderIndex = parts.findIndex((part) => isLooseFolderMatch(part, normalizedType));

  if (matchedFolderIndex >= 0 && parts.length > matchedFolderIndex + 2) {
    return normalizeName(parts[matchedFolderIndex + 1]);
  }

  return file.normalizedBaseName
    .replace(/-(lifestyle|detail|hero)-\d+$/g, '')
    .replace(/-\d+$/g, '');
}

function toTitle(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function getLocalImageCatalogByFurnitureType(furnitureTypes = []) {
  const storageSource = getImageStorageSource();
  const imageDir = expandHome(process.env.PRODUCT_IMAGE_DOWNLOAD_DIR || DEFAULT_IMAGE_DIR);
  const blobPrefix = getBlobPrefix();
  const allImages =
    storageSource === 'blob'
      ? (await listBlobImages(blobPrefix)).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      : (await collectImagesRecursive(imageDir)).sort((a, b) =>
          a.relativePath.localeCompare(b.relativePath)
        );

  const result = {};

  for (const requestedTypeRaw of furnitureTypes) {
    const requestedType = normalizeTag(requestedTypeRaw);
    if (!requestedType) continue;

    const matchingFiles = allImages.filter((file) => {
      const folderParts = String(file.relativeFolder || '')
        .split(/[\\/]/)
        .map(normalizeName)
        .filter(Boolean);
      return folderParts.some((part) => isLooseFolderMatch(part, requestedType));
    });

    const byHandle = new Map();

    for (const file of matchingFiles) {
      const handle = deriveHandleFromFile(file, requestedType);
      if (!handle) continue;

      if (!byHandle.has(handle)) byHandle.set(handle, []);
      byHandle.get(handle).push({
        fileName: file.fileName,
        filePath: file.filePath,
        relativePath: file.relativePath,
        relativeFolder: file.relativeFolder || null
      });
    }

    result[requestedType] = [...byHandle.entries()].map(([handle, imageOptions], index) => ({
      shopify_product_id: `${storageSource}:${requestedType}:${handle}:${index + 1}`,
      title: toTitle(handle),
      handle,
      product_type: requestedType,
      prompt_category: null,
      prompt_subcategory: null,
      prompt_style_tags: [],
      hero_descriptor: null,
      image_url: imageOptions[0]?.filePath || null,
      image_options: imageOptions.map((item) => item.filePath),
      image_option_details: imageOptions,
      in_stock: true,
      local_only: storageSource === 'local',
      storage_source: storageSource
    }));
  }

  return {
    storageSource,
    imageDir,
    blobPrefix,
    allImageCount: allImages.length,
    byFurnitureType: result
  };
}
