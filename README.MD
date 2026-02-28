# HTGT Prompts 2026

Standalone Next.js app (App Router, plain JavaScript).

Default mode uses **Google Sheets only** (no internal DB, no Shopify calls in normal flow).

## Current behavior

1. Load room/furniture options from the `room_to_furniture` sheet tab.
2. Pick room + furniture types in `/generator`.
3. Load product options from the `products` sheet tab.
4. Optionally choose featured products manually.
5. Generate prompt deterministically using:
   - style match `+50`
   - hero descriptor `+10`
   - image `+10`
   - in stock `+10`
6. Image choices can come from:
   - local folder (`PRODUCT_IMAGE_SOURCE=local`)
   - Vercel Blob (`PRODUCT_IMAGE_SOURCE=blob`)

## Env

```bash
PRODUCT_CATALOG_SOURCE=sheets
GOOGLE_SHEETS_CSV_URL=https://docs.google.com/spreadsheets/d/e/<SHEET_PUB_ID>/pub?output=csv
PRODUCT_IMAGE_SOURCE=local
PRODUCT_IMAGE_DOWNLOAD_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/Pictures-Htgt/Items

# Shopify integration (kept available, disabled by default)
SHOPIFY_SHOP=your-shop.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_xxx
SHOPIFY_API_VERSION=2025-10
DEBUG_SHOPIFY=0
```

If you later want Shopify catalog mode, set:

```bash
PRODUCT_CATALOG_SOURCE=shopify
```

If you want Vercel Blob image mode (recommended for Vercel deploys), set:

```bash
PRODUCT_IMAGE_SOURCE=blob
PRODUCT_IMAGE_BLOB_PREFIX=items
# On Vercel this is usually injected automatically after you connect Blob:
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx
```

If your files are stored at blob root (for example `accent table/...`), set
`PRODUCT_IMAGE_BLOB_PREFIX` to an empty string in Vercel.

Blob path convention for best matching:
- `items/<furniture-type>/<product-handle>.jpg`
- or `items/<furniture-type>/<product-handle>/<any-image-name>.jpg`

## Required sheet tabs

### `room_to_furniture`

Columns:
- `room_type`
- `furniture_types` (comma-separated in one cell)

### `products`

Columns (recommended):
- `title`
- `handle`
- `product_type`
- `status` (`active` or blank)
- `prompt_subcategory`
- `prompt_style_tags` (comma-separated)
- `hero_descriptor`
- `image_url`
- `in_stock` (`true/false`)

Optional:
- `shopify_product_id`
- `image_options` (comma-separated)
- `prompt_category`

### `presets`

Required:
- `slug`
- `prompt_template`

Optional:
- `name`
- `default_category`
- `default_subcategory`
- `default_style_tags`

### `rules`

Required:
- `rule_key`
- `weight_int`

## Run

```bash
npm install
npm run dev
```

## Cleanup

```bash
# remove build output
npm run clean

# full local reset (also removes dependencies)
npm run clean:all
```

Open:
- `http://localhost:3000/generator`

## API

- `GET /api/room-options`
- `POST /api/product-options`
  - returns products from sheet catalog
  - if none for a furniture type, falls back to image catalog (`local` folder or `blob`) as pseudo products
- `POST /api/generate-prompt`
- `POST /api/local-image-options`
  - body: `productHandle`, optional `furnitureType`
  - scans image source recursively (local folder or blob prefix)
  - tries handle match first (`<handle>.*`), then furniture-folder fallback

Shopify-only helpers (inactive unless `PRODUCT_CATALOG_SOURCE=shopify`):
- `POST /api/sync-products`
- `GET /api/debug-shopify-products`

Optional utility:
- `POST /api/save-product-image`
