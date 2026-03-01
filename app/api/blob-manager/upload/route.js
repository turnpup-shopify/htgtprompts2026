import { findBlobByPathname, getBlobToken, loadBlobModule, normalizePathname } from '@/lib/blob-admin';

export const runtime = 'nodejs';

function sanitizeFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const prefix = String(form.get('prefix') || '')
      .trim()
      .replace(/^\/+|\/+$/g, '');
    const explicitPathname = normalizePathname(form.get('pathname') || '');
    const replace = String(form.get('replace') || '')
      .trim()
      .toLowerCase() === 'true';

    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ ok: false, error: '`file` is required.' }, { status: 400 });
    }

    const fileName = sanitizeFileName(file.name || 'upload.bin') || 'upload.bin';
    const fallbackPathname = prefix ? `${prefix}/${fileName}` : fileName;
    const pathname = normalizePathname(explicitPathname || fallbackPathname);

    if (!pathname) {
      return Response.json({ ok: false, error: 'pathname could not be resolved.' }, { status: 400 });
    }

    const token = getBlobToken();
    const blobModule = await loadBlobModule();
    const existing = await findBlobByPathname({ blobModule, pathname, token });

    if (existing && !replace) {
      return Response.json(
        { ok: false, error: `File already exists at ${pathname}.`, pathname, exists: true },
        { status: 409 }
      );
    }

    if (existing) {
      await blobModule.del([existing.url], { token });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await blobModule.put(pathname, bytes, {
      access: 'public',
      addRandomSuffix: false,
      token
    });

    return Response.json({
      ok: true,
      pathname,
      blob: {
        pathname: String(uploaded.pathname || pathname),
        url: String(uploaded.url || '')
      }
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to upload blob file.' },
      { status: 500 }
    );
  }
}
