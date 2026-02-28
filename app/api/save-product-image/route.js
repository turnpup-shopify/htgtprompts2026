import os from 'os';
import path from 'path';
import { mkdir, readdir, rm, writeFile } from 'fs/promises';
import { normalizeTag } from '@/lib/normalize';
import { getImageStorageSource } from '@/lib/local-image-catalog';

export const runtime = 'nodejs';

const DEFAULT_IMAGE_DIR =
  '~/Library/Mobile Documents/com~apple~CloudDocs/Pictures-Htgt/Items';
const DEFAULT_BLOB_PREFIX = 'items';

function expandHome(inputPath) {
  if (!inputPath) return '';
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function sanitizeHandle(handle) {
  const safe = String(handle || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return safe || 'product-image';
}

function sanitizeFurnitureType(value) {
  return normalizeTag(value || '');
}

function getExtensionFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const match = url.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (!match) return '';
    const ext = match[1].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) {
      return ext;
    }
    return '';
  } catch {
    return '';
  }
}

function getExtensionFromContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('image/jpeg')) return 'jpg';
  if (normalized.includes('image/png')) return 'png';
  if (normalized.includes('image/webp')) return 'webp';
  if (normalized.includes('image/gif')) return 'gif';
  if (normalized.includes('image/avif')) return 'avif';
  return '';
}

async function findExistingFiles(dir, handle) {
  const files = await readdir(dir).catch(() => []);
  const prefix = `${handle}.`;

  return files.filter((fileName) => fileName.toLowerCase().startsWith(prefix));
}

function getBlobPrefix() {
  return String(process.env.PRODUCT_IMAGE_BLOB_PREFIX || DEFAULT_BLOB_PREFIX)
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

async function findExistingBlobFiles(blobModule, prefix, productHandle, token) {
  const response = await blobModule.list({
    prefix,
    limit: 1000,
    token
  });

  return (response.blobs || []).filter((blob) =>
    String(blob.pathname || '').startsWith(`${prefix}${productHandle}.`)
  );
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const productHandle = sanitizeHandle(body.productHandle);
    const imageUrl = String(body.imageUrl || '').trim();
    const replace = body.replace === true;
    const furnitureType = sanitizeFurnitureType(body.furnitureType);

    if (!imageUrl) {
      return Response.json({ ok: false, error: 'imageUrl is required.' }, { status: 400 });
    }

    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      return Response.json({ ok: false, error: 'imageUrl must be an absolute URL.' }, { status: 400 });
    }

    const storageSource = getImageStorageSource();

    const response = await fetch(imageUrl, { cache: 'no-store' });
    if (!response.ok) {
      return Response.json(
        { ok: false, error: `Failed to download image (${response.status}).` },
        { status: 502 }
      );
    }

    let extension = getExtensionFromUrl(imageUrl);
    if (!extension) {
      extension = getExtensionFromContentType(response.headers.get('content-type'));
    }
    if (!extension) {
      extension = 'jpg';
    }

    if (storageSource === 'blob') {
      let blobModule;

      try {
        const importModule = new Function('moduleName', 'return import(moduleName);');
        blobModule = await importModule('@vercel/blob');
      } catch {
        return Response.json(
          { ok: false, error: 'Missing @vercel/blob dependency. Run `npm install @vercel/blob`.' },
          { status: 500 }
        );
      }

      const token =
        process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN || undefined;
      const basePrefix = getBlobPrefix();
      const folderPrefix = furnitureType ? `${basePrefix}/${furnitureType}/` : `${basePrefix}/`;
      const existingFiles = await findExistingBlobFiles(
        blobModule,
        folderPrefix,
        productHandle,
        token
      );

      if (existingFiles.length > 0 && !replace) {
        return Response.json({
          ok: false,
          requiresReplaceConfirmation: true,
          storageSource,
          storageRoot: folderPrefix,
          productHandle,
          existingFiles: existingFiles.map((item) => item.pathname)
        });
      }

      if (existingFiles.length > 0) {
        await blobModule.del(existingFiles.map((item) => item.url), { token });
      }

      const fileName = `${productHandle}.${extension}`;
      const pathname = `${folderPrefix}${fileName}`.replace(/\/+/g, '/');
      const bytes = Buffer.from(await response.arrayBuffer());

      const uploaded = await blobModule.put(pathname, bytes, {
        access: 'public',
        addRandomSuffix: false,
        token
      });

      return Response.json({
        ok: true,
        storageSource,
        storageRoot: folderPrefix,
        productHandle,
        fileName,
        filePath: uploaded.url,
        replacedExisting: existingFiles.length > 0
      });
    }

    const imageDir = expandHome(process.env.PRODUCT_IMAGE_DOWNLOAD_DIR || DEFAULT_IMAGE_DIR);
    const saveDir = furnitureType ? path.join(imageDir, furnitureType) : imageDir;
    await mkdir(saveDir, { recursive: true });

    const existingFiles = await findExistingFiles(saveDir, productHandle);
    if (existingFiles.length > 0 && !replace) {
      return Response.json({
        ok: false,
        requiresReplaceConfirmation: true,
        storageSource,
        storageRoot: saveDir,
        productHandle,
        existingFiles
      });
    }

    for (const fileName of existingFiles) {
      await rm(path.join(saveDir, fileName), { force: true });
    }

    const fileName = `${productHandle}.${extension}`;
    const filePath = path.join(saveDir, fileName);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, bytes);

    return Response.json({
      ok: true,
      storageSource,
      storageRoot: saveDir,
      productHandle,
      fileName,
      filePath,
      replacedExisting: existingFiles.length > 0
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to save product image.' },
      { status: 500 }
    );
  }
}
