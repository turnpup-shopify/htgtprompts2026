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
