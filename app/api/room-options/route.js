import { getRoomOptions } from '@/lib/room-furniture';

export async function GET() {
  try {
    const data = await getRoomOptions();
    return Response.json({ ok: true, ...data });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || 'Failed to load room options' },
      { status: 500 }
    );
  }
}

