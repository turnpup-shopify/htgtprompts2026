import { normalizeTag } from './normalize';

export function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  const text = String(csvText || '');

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }

      row.push(cell.trim());
      cell = '';

      if (row.some((entry) => entry !== '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((entry) => entry !== '')) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header) {
  return normalizeTag(header).replace(/\s+/g, '_');
}

export function parseCsvObjects(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    return { headers: [], records: [] };
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  const records = rows.slice(1).map((row) => {
    const record = {};

    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      if (!header) continue;
      record[header] = row[i] || '';
    }

    return record;
  });

  return { headers, records };
}

export async function fetchCsvObjects(url) {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSV (${response.status})`);
  }

  const csvText = await response.text();
  return parseCsvObjects(csvText);
}

