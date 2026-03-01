import { findBlobByPathname, getBlobToken, loadBlobModule, normalizePathname } from '@/lib/blob-admin';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fromPathname = normalizePathname(body.fromPathname || body.from || '');
    const toPathname = normalizePathname(body.toPathname || body.to || '');
    const replace = body.replace === true;

    if (!fromPathname || !toPathname) {
      return Response.json(
        { ok: false, error: '`fromPathname` and `toPathname` are required.' },
        { status: 400 }
      );
    }

    if (fromPathname === toPathname) {
      return Response.json({ ok: false, error: 'Source and target pathnames are the same.' }, { status: 400 });
    }

    const token = getBlobToken();
    const blobModule = await loadBlobModule();
    const sourceBlob = await findBlobByPathname({ blobModule, pathname: fromPathname, token });

    if (!sourceBlob) {
      return Response.json({ ok: false, error: `Source not found: ${fromPathname}` }, { status: 404 });
    }

    const targetBlob = await findBlobByPathname({ blobModule, pathname: toPathname, token });
    if (targetBlob && !replace) {
      return Response.json(
        { ok: false, error: `Target already exists: ${toPathname}.`, exists: true },
        { status: 409 }
      );
    }

    const sourceResponse = await fetch(sourceBlob.url, { cache: 'no-store' });
    if (!sourceResponse.ok) {
      return Response.json(
        { ok: false, error: `Failed to read source blob (${sourceResponse.status}).` },
        { status: 502 }
      );
    }

    if (targetBlob) {
      await blobModule.del([targetBlob.url], { token });
    }

    const bytes = Buffer.from(await sourceResponse.arrayBuffer());
    const uploaded = await blobModule.put(toPathname, bytes, {
      access: 'public',
      addRandomSuffix: false,
      token
    });

    await blobModule.del([sourceBlob.url], { token });

    return Response.json({
      ok: true,
      fromPathname,
      toPathname,
      blob: {
        pathname: String(uploaded.pathname || toPathname),
        url: String(uploaded.url || '')
      }
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to rename blob file.' },
      { status: 500 }
    );
  }
}
