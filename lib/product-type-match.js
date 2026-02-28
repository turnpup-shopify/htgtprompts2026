import { normalizeTag } from './normalize';

function singularizeWord(word) {
  const value = String(word || '');
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith('es') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('s') && value.length > 3) return value.slice(0, -1);
  return value;
}

function normalizeProductType(value) {
  return normalizeTag(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(singularizeWord)
    .join(' ');
}

export function isProductTypeMatch(productType, requestedType) {
  const a = normalizeProductType(productType);
  const b = normalizeProductType(requestedType);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b)) return true;
  if (b.includes(a)) return true;
  return false;
}

