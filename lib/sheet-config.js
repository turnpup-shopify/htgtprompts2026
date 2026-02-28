import { fetchCsvObjects } from './csv';
import { normalizeTag, parseTagList } from './normalize';
import { resolveSheetCsvUrl } from './sheets-url';

const DEFAULT_PRESET = {
  slug: 'living-room-corner-warm-minimal',
  name: 'Living Room Corner Warm Minimal',
  prompt_template: [
    'Create a furniture styling prompt for the room type: {{room_type}}.',
    'Style direction: {{requested_style_tags}}.',
    'Subcategory focus: {{requested_subcategory}}.',
    'Furniture types to include: {{selected_furniture_types}}.',
    'Selected products:',
    '{{selected_products_bullets}}',
    'Primary product: {{product_title}}.',
    'Product hero descriptor: {{hero_descriptor}}.',
    'Product image reference: {{image_url}}.',
    'Product category: {{prompt_category}}.',
    'Product subcategory: {{prompt_subcategory}}.',
    'Product style tags: {{prompt_style_tags}}.'
  ].join('\n'),
  default_category: 'living-room',
  default_subcategory: 'corner',
  default_style_tags: ['warm', 'minimal']
};

const DEFAULT_RULES = [
  { rule_key: 'style_match', weight_int: 50 },
  { rule_key: 'hero_descriptor', weight_int: 10 },
  { rule_key: 'image', weight_int: 10 },
  { rule_key: 'in_stock', weight_int: 10 }
];

function normalizeRoomKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function pickHeader(record, keys) {
  for (const key of keys) {
    if (record[key]) return record[key];
  }

  return '';
}

function parsePresets(records = []) {
  const parsed = records
    .map((record) => {
      const slug = normalizeTag(pickHeader(record, ['slug', 'preset_slug']));
      const name = pickHeader(record, ['name', 'preset_name']) || slug;
      const promptTemplate = pickHeader(record, ['prompt_template', 'template']);
      const defaultCategory = normalizeTag(
        pickHeader(record, ['default_category', 'category', 'room_type'])
      );
      const defaultSubcategory = normalizeTag(
        pickHeader(record, ['default_subcategory', 'subcategory'])
      );
      const defaultStyleTags = parseTagList(
        pickHeader(record, ['default_style_tags', 'style_tags'])
      );

      if (!slug || !promptTemplate) return null;

      return {
        slug,
        name: String(name || slug).trim(),
        prompt_template: String(promptTemplate || '').trim(),
        default_category: defaultCategory || 'living-room',
        default_subcategory: defaultSubcategory || '',
        default_style_tags: defaultStyleTags
      };
    })
    .filter(Boolean);

  return parsed.length ? parsed : [DEFAULT_PRESET];
}

function parseRules(records = []) {
  const parsed = records
    .map((record) => {
      const ruleKey = normalizeTag(pickHeader(record, ['rule_key', 'key', 'rule']));
      const weight = Number(pickHeader(record, ['weight_int', 'weight', 'points']));

      if (!ruleKey || !Number.isFinite(weight)) return null;

      return {
        rule_key: ruleKey,
        weight_int: Math.round(weight)
      };
    })
    .filter(Boolean);

  return parsed.length ? parsed : DEFAULT_RULES;
}

function parseMasterRows(records = []) {
  return records
    .map((record) => {
      const room = String(pickHeader(record, ['room', 'room_type', 'category']) || '').trim();
      const roomKey = normalizeRoomKey(room);
      if (!room || !roomKey) return null;

      return {
        room,
        room_key: roomKey,
        room_details: String(pickHeader(record, ['room_details']) || '').trim(),
        furniture_decor: String(pickHeader(record, ['furniture_decor']) || '').trim(),
        materials: String(pickHeader(record, ['materials']) || '').trim(),
        lighting: String(pickHeader(record, ['lighting']) || '').trim(),
        camera: String(pickHeader(record, ['camera']) || '').trim(),
        color_grade: String(pickHeader(record, ['color_grade']) || '').trim(),
        negative_styling_rules: String(
          pickHeader(record, ['negative_styling_rules']) || ''
        ).trim(),
        hero_object_placement_logic: String(
          pickHeader(record, ['hero_object_placement_logic']) || ''
        ).trim(),
        realism_constraints: String(pickHeader(record, ['realism_constraints']) || '').trim(),
        style_tags: parseTagList(pickHeader(record, ['style_tags']))
      };
    })
    .filter(Boolean);
}

async function readCsvRecords(url) {
  const { records } = await fetchCsvObjects(url);
  return records;
}

export async function getPresets() {
  const url = resolveSheetCsvUrl('presets', process.env.PRESETS_CSV_URL);
  if (!url) return [DEFAULT_PRESET];
  return parsePresets(await readCsvRecords(url));
}

export async function getPresetBySlug(slug) {
  const normalized = normalizeTag(slug) || DEFAULT_PRESET.slug;
  const presets = await getPresets();
  return presets.find((preset) => preset.slug === normalized) || null;
}

export async function getRuleRows() {
  const url = resolveSheetCsvUrl('rules', process.env.RULES_CSV_URL);
  if (!url) return DEFAULT_RULES;
  return parseRules(await readCsvRecords(url));
}

export async function getMasterRows() {
  const url = resolveSheetCsvUrl('master', process.env.MASTER_CSV_URL);
  if (!url) return [];
  return parseMasterRows(await readCsvRecords(url));
}

export function findMasterRowByRoom(roomType, rows = []) {
  const roomKey = normalizeRoomKey(roomType);
  if (!roomKey || !rows.length) return null;

  const exact = rows.find((row) => row.room_key === roomKey);
  if (exact) return exact;

  const partial = rows.find(
    (row) => row.room_key.includes(roomKey) || roomKey.includes(row.room_key)
  );
  if (partial) return partial;

  return null;
}

export async function getMasterRowByRoom(roomType) {
  const rows = await getMasterRows();
  return findMasterRowByRoom(roomType, rows);
}
