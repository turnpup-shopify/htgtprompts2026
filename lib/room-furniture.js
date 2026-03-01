import { fetchCsvObjects } from './csv';
import { normalizeTag } from './normalize';
import { resolveSheetCsvUrl } from './sheets-url';
import { getMasterRows } from './sheet-config';

const SAMPLE_ROOM_MAP = {
  'living-room': ['sofa', 'coffee table', 'accent chair', 'side table', 'console'],
  bedroom: ['bed', 'nightstand', 'dresser', 'bench'],
  dining: ['dining table', 'dining chair', 'sideboard'],
  office: ['desk', 'office chair', 'bookcase']
};

const ROOM_HEADER_KEYS = ['room_type', 'room', 'roomtype', 'room_name'];
const FURNITURE_HEADER_KEYS = [
  'furniture_types',
  'furniture_type',
  'furniture',
  'furniture_options',
  'furniture_pieces',
  'furniture_list',
  'product_types',
  'product_type'
];

function pickHeader(record, keys) {
  for (const key of keys) {
    if (record[key]) return record[key];
  }

  return '';
}

function parseFurnitureList(value) {
  return String(value || '')
    .split(',')
    .map((item) => normalizeTag(item))
    .filter(Boolean);
}

function normalizeRoomKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveFurnitureTypesForRoom(roomLabel, roomOptions = []) {
  const roomKey = normalizeRoomKey(roomLabel);
  if (!roomKey) return [];

  const exact = roomOptions.find((item) => normalizeRoomKey(item.roomType) === roomKey);
  if (exact?.furnitureTypes?.length) return exact.furnitureTypes;

  const partial = roomOptions.find((item) => {
    const optionKey = normalizeRoomKey(item.roomType);
    return optionKey && (optionKey.includes(roomKey) || roomKey.includes(optionKey));
  });
  if (partial?.furnitureTypes?.length) return partial.furnitureTypes;

  return [];
}

function parseRoomToFurnitureRecords(records = [], headers = []) {
  const map = new Map();

  for (const record of records) {
    const roomType = normalizeTag(pickHeader(record, ROOM_HEADER_KEYS));
    const furnitureTypes = parseFurnitureList(pickHeader(record, FURNITURE_HEADER_KEYS));

    if (!roomType || furnitureTypes.length === 0) continue;

    if (!map.has(roomType)) {
      map.set(roomType, new Set());
    }

    const set = map.get(roomType);
    for (const furnitureType of furnitureTypes) {
      set.add(furnitureType);
    }
  }

  const roomOptions = [...map.entries()]
    .map(([roomType, furnitureSet]) => ({
      roomType,
      furnitureTypes: [...furnitureSet].sort(),
      styleTags: []
    }))
    .sort((a, b) => a.roomType.localeCompare(b.roomType));

  if (!roomOptions.length && records.length) {
    throw new Error(
      `CSV must include room_type and furniture_types columns (or close variants). Found headers: ${headers.join(
        ', '
      )}`
    );
  }

  return roomOptions;
}

export async function getRoomOptions() {
  const url = resolveSheetCsvUrl('room_to_furniture', process.env.ROOM_TO_FURNITURE_CSV_URL);
  const masterRows = await getMasterRows().catch(() => []);

  let baseRoomOptions = [];
  let source = 'sample';

  if (!url) {
    baseRoomOptions = Object.entries(SAMPLE_ROOM_MAP).map(([roomType, furnitureTypes]) => ({
      roomType,
      furnitureTypes,
      styleTags: []
    }));
  } else {
    const { headers, records } = await fetchCsvObjects(url);
    baseRoomOptions = parseRoomToFurnitureRecords(records, headers);
    source = url;
  }

  if (masterRows.length) {
    const deduped = new Map();

    for (const row of masterRows) {
      const roomLabel = String(row.room || '').trim();
      if (!roomLabel) continue;
      const roomKey = normalizeRoomKey(roomLabel);
      if (!roomKey || deduped.has(roomKey)) continue;

      deduped.set(roomKey, {
        roomType: roomLabel,
        furnitureTypes: resolveFurnitureTypesForRoom(roomLabel, baseRoomOptions),
        styleTags: Array.isArray(row.style_tags) ? row.style_tags : []
      });
    }

    const roomOptions = [...deduped.values()].sort((a, b) =>
      String(a.roomType).localeCompare(String(b.roomType))
    );

    if (roomOptions.length) {
      return {
        source: `master+${source}`,
        roomOptions
      };
    }
  }

  return {
    source,
    roomOptions: baseRoomOptions
  };
}
