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

    const responseText = await res.text();
    console.log('[submit-to-sheet] GAS response:', res.status, responseText.substring(0, 500));

    if (!res.ok) {
      return Response.json({ error: `Script returned HTTP ${res.status}`, detail: responseText.substring(0, 500) }, { status: 502 });
    }

    // GAS returns 200 even on script errors — check the body
    let parsed = null;
    try { parsed = JSON.parse(responseText); } catch {}

    if (parsed?.error || responseText.toLowerCase().includes('error') && !parsed?.ok) {
      return Response.json({ error: 'GAS script error', detail: responseText.substring(0, 500) }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[submit-to-sheet]', err);
    return Response.json({ error: err?.message || 'Submission failed' }, { status: 500 });
  }
}
