import { findBlobByPathname, getBlobToken, loadBlobModule, normalizePathname } from '@/lib/blob-admin';

export const runtime = 'nodejs';

function parsePathnames(value) {
  if (Array.isArray(value)) return value.map((item) => normalizePathname(item)).filter(Boolean);
  return [normalizePathname(value)].filter(Boolean);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const pathnames = parsePathnames(body.pathnames || body.pathname);

    if (!pathnames.length) {
      return Response.json({ ok: false, error: '`pathname` or `pathnames` is required.' }, { status: 400 });
    }

    const token = getBlobToken();
    const blobModule = await loadBlobModule();
    const urls = [];
    const missing = [];

    for (const pathname of pathnames) {
      // eslint-disable-next-line no-await-in-loop
      const blob = await findBlobByPathname({ blobModule, pathname, token });
      if (!blob) {
        missing.push(pathname);
        continue;
      }
      urls.push(blob.url);
    }

    if (urls.length) {
      await blobModule.del(urls, { token });
    }

    return Response.json({
      ok: true,
      deletedCount: urls.length,
      missing
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to delete blob file(s).' },
      { status: 500 }
    );
  }
}
