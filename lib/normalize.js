export function normalizeTag(tag) {
  return String(tag || '').trim().toLowerCase();
}

export function parseTagList(value) {
  if (!value) return [];

  const raw = Array.isArray(value) ? value : String(value).split(',');
  const normalized = raw.map(normalizeTag).filter(Boolean);
  return [...new Set(normalized)];
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }

  return '';
}

export function parsePromptTags(tags = []) {
  const parsed = {
    category: '',
    subcategory: '',
    heroDescriptor: '',
    styleTags: []
  };

  for (const rawTag of tags) {
    const tag = normalizeTag(rawTag);

    if (tag.startsWith('prompt.category:')) {
      parsed.category = tag.slice('prompt.category:'.length).trim();
    }

    if (tag.startsWith('prompt.subcategory:')) {
      parsed.subcategory = tag.slice('prompt.subcategory:'.length).trim();
    }

    if (tag.startsWith('prompt.hero_descriptor:')) {
      parsed.heroDescriptor = tag.slice('prompt.hero_descriptor:'.length).trim();
    }

    if (tag.startsWith('prompt.style:')) {
      const style = tag.slice('prompt.style:'.length).trim();
      if (style) parsed.styleTags.push(style);
    }
  }

  parsed.styleTags = [...new Set(parsed.styleTags)];

  return parsed;
}
