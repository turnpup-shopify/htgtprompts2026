import {
  getBlobToken,
  getDefaultBlobPrefix,
  listAllBlobs,
  loadBlobModule,
  normalizePrefix
} from '@/lib/blob-admin';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const hasPrefixParam = searchParams.has('prefix');
    const requestedPrefix = hasPrefixParam
      ? normalizePrefix(searchParams.get('prefix') || '')
      : getDefaultBlobPrefix();
    const token = getBlobToken();
    const blobModule = await loadBlobModule();
    const blobs = await listAllBlobs({ blobModule, prefix: requestedPrefix, token });
    const ordered = [...blobs].sort((a, b) =>
      String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''))
    );

    return Response.json({
      ok: true,
      prefix: requestedPrefix,
      configuredDefaultPrefix: getDefaultBlobPrefix(),
      count: ordered.length,
      blobs: ordered.map((item) => ({
        pathname: String(item.pathname || ''),
        url: String(item.url || ''),
        size: Number(item.size || 0),
        contentType: String(item.contentType || ''),
        uploadedAt: item.uploadedAt ? String(item.uploadedAt) : ''
      }))
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to list blob files.' },
      { status: 500 }
    );
  }
}
