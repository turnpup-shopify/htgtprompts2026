export async function POST(req) {
  try {
    const { gasUrl, data } = await req.json();

    const targetUrl = gasUrl || process.env.GOOGLEAPPSCRIPTURL;

    if (!targetUrl || !data) {
      return Response.json({ error: 'Missing gasUrl or data' }, { status: 400 });
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow',
    });

    if (!res.ok) {
      return Response.json({ error: `Script returned HTTP ${res.status}` }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[submit-to-sheet]', err);
    return Response.json({ error: err?.message || 'Submission failed' }, { status: 500 });
  }
}
