function firstNonEmpty(...values) {
  for (const value of values) {
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function withSheetParam(urlString, sheetName) {
  const url = new URL(urlString);
  url.searchParams.set('output', 'csv');
  url.searchParams.set('sheet', sheetName);
  return url.toString();
}

export function resolveSheetCsvUrl(sheetName, explicitUrl) {
  const baseUrl = firstNonEmpty(
    explicitUrl,
    process.env.GOOGLE_SHEETS_CSV_URL,
    process.env.SHEETS_BASE_CSV_URL,
    process.env.SHEETS_CSV_BASE_URL
  );

  if (!baseUrl) return '';

  try {
    return withSheetParam(baseUrl, sheetName);
  } catch {
    return '';
  }
}

