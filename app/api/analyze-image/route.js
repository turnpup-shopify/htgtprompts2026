import Anthropic from '@anthropic-ai/sdk';

const EXTRACT_PROMPT = `Analyze this interior design / room photograph and extract structured metadata for an AI image generation prompt database.

Return ONLY a valid JSON object with exactly these keys (no markdown fences, no explanation):

{
  "room_type": "Short descriptive room type name (e.g. 'Living room corner', 'Bedroom reading nook')",
  "room_details": "Detailed description of the room's fixed architectural features: wall treatments, flooring, ceiling, windows, built-ins, spatial arrangement, textures and colors",
  "furniture_types": "Comma-separated list of main furniture types visible (e.g. 'Accent Chair, Side Table, Floor Lamp')",
  "materials": "Comma-separated list of key materials and finishes (e.g. 'Limewash plaster, Oak hardwood, Cognac leather, Brushed brass')",
  "lighting": "Lighting quality, direction, source, and mood (e.g. 'Soft directional daylight from left window, warm ambient fill, no harsh shadows')",
  "camera": "Camera angle, lens feel, and composition style (e.g. 'Eye-level, medium shot, slight three-quarter angle, 50mm lens feel')",
  "color_grade": "Overall color palette and tone description (e.g. 'Warm earthy neutrals, low saturation, muted cognac and ivory palette')",
  "negative_styling_rules": "What is absent or should be avoided in this aesthetic (e.g. 'No clutter, no bright colors, no chrome hardware, no visible technology')",
  "hero_object_placement_logic": "Where a new hero product object would ideally be placed in this scene and why",
  "realism_constraints": "Technical photorealism rendering requirements (e.g. 'Accurate contact shadows, realistic material texture, no cutout edges, no halo effects')",
  "style_tags": "Comma-separated style keywords (e.g. 'Mediterranean, Minimalist, Wabi-sabi')",
  "scene": "Optional scene category if applicable (e.g. 'Outdoor', 'Kitchen') — use empty string if not applicable"
}`;

export async function POST(req) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY not configured in .env' }, { status: 500 });
    }

    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: EXTRACT_PROMPT,
            },
          ],
        },
      ],
    });

    const text = message.content[0]?.text || '';

    let data;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      data = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return Response.json({ error: 'Failed to parse Claude response', raw: text }, { status: 500 });
    }

    return Response.json({ data });
  } catch (err) {
    console.error('[analyze-image]', err);
    return Response.json({ error: err?.message || 'Analysis failed' }, { status: 500 });
  }
}
