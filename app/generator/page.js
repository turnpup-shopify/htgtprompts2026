'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_PRESET_SLUG = 'living-room-corner-warm-minimal';

function pickRandomSubset(items, min = 2, max = 4) {
  const source = [...new Set(items)].filter(Boolean);
  if (!source.length) return [];

  const lower = Math.max(1, Math.min(min, source.length));
  const upper = Math.max(lower, Math.min(max, source.length));
  const count = Math.floor(Math.random() * (upper - lower + 1)) + lower;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function GeneratorPage() {
  const [roomOptions, setRoomOptions] = useState([]);
  const [roomType, setRoomType] = useState('');
  const [selectedFurnitureTypes, setSelectedFurnitureTypes] = useState([]);
  const [customFurnitureType, setCustomFurnitureType] = useState('');
  const [productOptionsByType, setProductOptionsByType] = useState({});
  const [featuredProductsByType, setFeaturedProductsByType] = useState({});
  const [subcategory, setSubcategory] = useState('corner');
  const [styleTags, setStyleTags] = useState('warm, minimal');
  const [roomOptionsLoading, setRoomOptionsLoading] = useState(true);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [catalogSource, setCatalogSource] = useState('sheets');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [selectedImageByKey, setSelectedImageByKey] = useState({});
  const [localImageOptionsByKey, setLocalImageOptionsByKey] = useState({});
  const [localImageStatusByKey, setLocalImageStatusByKey] = useState({});
  const [hoveredPreviewKey, setHoveredPreviewKey] = useState('');

  const furnitureOptionsForRoom = useMemo(() => {
    const selectedRoom = roomOptions.find((item) => item.roomType === roomType);
    return selectedRoom?.furnitureTypes || [];
  }, [roomOptions, roomType]);

  const visibleFurnitureTypes = useMemo(() => {
    const merged = [...furnitureOptionsForRoom, ...selectedFurnitureTypes];
    return [...new Set(merged)];
  }, [furnitureOptionsForRoom, selectedFurnitureTypes]);

  const selectedProductByFurnitureType = useMemo(() => {
    const map = {};
    const selected = result?.selectedProducts || [];

    for (const item of selected) {
      if (!item?.furniture_type) continue;
      if (!map[item.furniture_type]) {
        map[item.furniture_type] = item;
      }
    }

    return map;
  }, [result]);

  useEffect(() => {
    async function loadRoomOptions() {
      setRoomOptionsLoading(true);
      setError('');

      try {
        const response = await fetch('/api/room-options');
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Failed to load room options');
        }

        const options = payload.roomOptions || [];
        setRoomOptions(options);

        if (options.length) {
          const preferred = options.find((item) => item.roomType === 'living-room');
          const nextRoomType = preferred?.roomType || options[0].roomType;
          setRoomType(nextRoomType);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setRoomOptionsLoading(false);
      }
    }

    loadRoomOptions();
  }, []);

  useEffect(() => {
    if (!furnitureOptionsForRoom.length) {
      setSelectedFurnitureTypes([]);
      return;
    }

    setSelectedFurnitureTypes(pickRandomSubset(furnitureOptionsForRoom, 2, 4));
  }, [furnitureOptionsForRoom]);

  useEffect(() => {
    if (!roomType || selectedFurnitureTypes.length === 0) {
      setProductOptionsByType({});
      setFeaturedProductsByType({});
      return;
    }

    let isCancelled = false;

    async function loadProductOptions() {
      setProductOptionsLoading(true);
      setError('');

      try {
        const response = await fetch('/api/product-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomType,
            furnitureTypes: selectedFurnitureTypes
          })
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Failed to load product options');
        }

        if (isCancelled) return;

        const optionsByType = payload.optionsByFurnitureType || {};
        setProductOptionsByType(optionsByType);
        setCatalogSource(payload.source || 'sheets');
        setFeaturedProductsByType((current) => {
          const next = {};

          for (const type of selectedFurnitureTypes) {
            const selected = current[type] || '';
            const options = optionsByType[type] || [];
            const stillValid = options.some((option) => option.shopify_product_id === selected);
            next[type] = stillValid ? selected : '';
          }

          return next;
        });
      } catch (err) {
        if (!isCancelled) {
          setProductOptionsByType({});
          setFeaturedProductsByType({});
          setError(err.message);
        }
      } finally {
        if (!isCancelled) {
          setProductOptionsLoading(false);
        }
      }
    }

    loadProductOptions();

    return () => {
      isCancelled = true;
    };
  }, [roomType, selectedFurnitureTypes]);

  useEffect(() => {
    if (!selectedFurnitureTypes.length) {
      setLocalImageOptionsByKey({});
      setLocalImageStatusByKey({});
      return;
    }

    let isCancelled = false;

    async function loadLocalImages() {
      const nextOptions = {};
      const nextStatus = {};

      for (const furnitureType of selectedFurnitureTypes) {
        const key = furnitureType;
        const selectedProduct = selectedProductByFurnitureType[furnitureType];

        try {
          const response = await fetch('/api/local-image-options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productHandle: selectedProduct?.handle || '',
              furnitureType
            })
          });
          const payload = await response.json();

          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || 'Failed to load local image options');
          }

          nextOptions[key] = payload.options || [];
          nextStatus[key] = payload.options?.length
            ? null
            : payload.storageSource === 'blob'
              ? `No Vercel Blob images found for furniture type "${furnitureType}".`
              : `No local images found for furniture type "${furnitureType}".`;
        } catch (err) {
          nextOptions[key] = [];
          nextStatus[key] = err.message || 'Failed to load local image options.';
        }
      }

      if (isCancelled) return;

      setLocalImageOptionsByKey(nextOptions);
      setLocalImageStatusByKey(nextStatus);
      setSelectedImageByKey((current) => {
        const next = { ...current };

        for (const furnitureType of selectedFurnitureTypes) {
          const key = furnitureType;
          const options = nextOptions[key] || [];
          const currentPath = next[key] || '';
          const stillValid = options.some((option) => option.filePath === currentPath);
          next[key] = stillValid ? currentPath : options[0]?.filePath || '';
        }

        return next;
      });
    }

    loadLocalImages();

    return () => {
      isCancelled = true;
    };
  }, [selectedFurnitureTypes, selectedProductByFurnitureType]);

  useEffect(() => {
    if (!selectedFurnitureTypes.length) return;

    setSelectedImageByKey((current) => {
      const next = { ...current };

      for (const furnitureType of selectedFurnitureTypes) {
        const key = furnitureType;
        const options = localImageOptionsByKey[key] || [];
        if (!options.length) continue;
        const values = options.map((option) => option.filePath);
        if (!next[key] || !values.includes(next[key])) {
          next[key] = values[0];
        }
      }

      return next;
    });
  }, [selectedFurnitureTypes, localImageOptionsByKey]);

  function randomizeFurnitureSet() {
    setSelectedFurnitureTypes(pickRandomSubset(furnitureOptionsForRoom, 2, 4));
  }

  function toggleFurnitureType(type) {
    setSelectedFurnitureTypes((current) => {
      if (current.includes(type)) {
        return current.filter((item) => item !== type);
      }

      return [...current, type];
    });
  }

  function addCustomFurnitureType() {
    const normalized = String(customFurnitureType || '').trim().toLowerCase();
    if (!normalized) return;

    setSelectedFurnitureTypes((current) =>
      current.includes(normalized) ? current : [...current, normalized]
    );
    setCustomFurnitureType('');
  }

  function setFeaturedProduct(type, productId) {
    setFeaturedProductsByType((current) => ({
      ...current,
      [type]: productId
    }));
  }

  function setSelectedImage(key, imageUrl) {
    setSelectedImageByKey((current) => ({
      ...current,
      [key]: imageUrl
    }));
  }

  function showImagePreview(key) {
    setHoveredPreviewKey(key);
  }

  function hideImagePreview(key) {
    setHoveredPreviewKey((current) => (current === key ? '' : current));
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetSlug: DEFAULT_PRESET_SLUG,
          roomType,
          furnitureTypes: selectedFurnitureTypes,
          featuredProductsByType,
          subcategory,
          styleTags
        })
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to generate prompt');
      }

      setResult(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Deterministic Prompt Generator</h1>
      <p>
        Preset slug: <span className="mono">{DEFAULT_PRESET_SLUG}</span>
      </p>
      <p className="mono" style={{ marginTop: '-0.5rem' }}>
        Data mode: {catalogSource === 'shopify' ? 'Shopify catalog' : 'Google Sheets catalog'}.
      </p>

      <div className="grid grid-2">
        <section className="card">
          <h2>Controls</h2>
          <form onSubmit={handleGenerate} className="grid">
            <div>
              <label htmlFor="roomType">Room Type</label>
              <select
                id="roomType"
                value={roomType}
                onChange={(event) => setRoomType(event.target.value)}
                disabled={roomOptionsLoading || !roomOptions.length}
              >
                {roomOptions.map((item) => (
                  <option key={item.roomType} value={item.roomType}>
                    {item.roomType}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Furniture Options (from room_to_furniture sheet)</label>
              <div className="card" style={{ background: '#f8faf8', padding: '0.75rem' }}>
                <div className="row" style={{ marginBottom: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={randomizeFurnitureSet}
                    disabled={!furnitureOptionsForRoom.length}
                  >
                    Auto-Select Random Furniture Set
                  </button>
                </div>
                {!furnitureOptionsForRoom.length ? (
                  <p className="mono" style={{ margin: 0 }}>
                    No furniture options found for this room type.
                  </p>
                ) : (
                  <div className="checkbox-grid">
                    {visibleFurnitureTypes.map((type) => (
                      <label key={type} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={selectedFurnitureTypes.includes(type)}
                          onChange={() => toggleFurnitureType(type)}
                        />{' '}
                        {type}
                      </label>
                    ))}
                  </div>
                )}
                <div className="row" style={{ marginTop: '0.75rem' }}>
                  <input
                    value={customFurnitureType}
                    onChange={(event) => setCustomFurnitureType(event.target.value)}
                    placeholder="add custom furniture type (e.g. accent tables)"
                  />
                  <button type="button" onClick={addCustomFurnitureType}>
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label>Featured Product Selection (optional)</label>
              <div className="card" style={{ background: '#f8faf8', padding: '0.75rem' }}>
                {productOptionsLoading ? (
                  <p className="mono" style={{ margin: 0 }}>
                    Loading product options...
                  </p>
                ) : selectedFurnitureTypes.length === 0 ? (
                  <p className="mono" style={{ margin: 0 }}>
                    Select furniture types to choose featured products.
                  </p>
                ) : (
                  <div className="grid">
                    {selectedFurnitureTypes.map((type) => {
                      const options = productOptionsByType[type] || [];

                      return (
                        <div key={type}>
                          <label htmlFor={`featured-${type}`}>{type}</label>
                          <select
                            id={`featured-${type}`}
                            value={featuredProductsByType[type] || ''}
                            onChange={(event) => setFeaturedProduct(type, event.target.value)}
                          >
                            <option value="">Auto Pick (deterministic)</option>
                            {options.map((option) => (
                              <option
                                key={option.shopify_product_id}
                                value={option.shopify_product_id}
                              >
                                {option.title}
                                {option.catalog_origin === 'blob'
                                  ? ' (blob)'
                                  : option.catalog_origin === 'local'
                                    ? ' (local folder)'
                                    : ''}
                                {option.in_stock ? '' : ' (out of stock)'}
                              </option>
                            ))}
                          </select>
                          {options.length === 0 ? (
                            <p className="mono" style={{ margin: '0.35rem 0 0' }}>
                              No catalog products found for this product type. Check your `products` sheet `product_type` values.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="subcategory">Subcategory</label>
              <input
                id="subcategory"
                value={subcategory}
                onChange={(event) => setSubcategory(event.target.value)}
                placeholder="corner"
              />
            </div>
            <div>
              <label htmlFor="styleTags">Style Tags (comma-separated)</label>
              <input
                id="styleTags"
                value={styleTags}
                onChange={(event) => setStyleTags(event.target.value)}
                placeholder="warm, minimal"
              />
            </div>
            <button type="submit" disabled={loading}>
              {loading ? 'Generating...' : 'Generate Prompt'}
            </button>
          </form>
          {error ? <p style={{ color: '#991b1b', marginTop: '1rem' }}>{error}</p> : null}
        </section>

        <section className="card">
          <h2>Prompt Output</h2>
          <textarea
            readOnly
            value={result?.prompt || ''}
            placeholder="Generated prompt appears here..."
          />
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Debug Panel</h2>
        <pre className="mono" style={{ overflowX: 'auto', margin: 0 }}>
          {JSON.stringify(
            result
              ? {
                  input: result.input,
                  selectedProduct: result.selectedProduct,
                  selectedProducts: result.selectedProducts,
                  scoreBreakdown: result.scoreBreakdown,
                  debug: result.debug
                }
              : {
                  input: null,
                  selectedProduct: null,
                  selectedProducts: null,
                  scoreBreakdown: null,
                  debug: null
                },
            null,
            2
          )}
        </pre>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Image Catalog Options</h2>
        {!selectedFurnitureTypes.length ? (
          <p className="mono" style={{ margin: 0 }}>
            Select at least one furniture type to load image options.
          </p>
        ) : (
          <div className="grid">
            {selectedFurnitureTypes.map((furnitureType) => {
              const key = furnitureType;
              const selectedProduct = selectedProductByFurnitureType[furnitureType];
              const imageOptions = localImageOptionsByKey[key] || [];
              const selectedImage = selectedImageByKey[key] || imageOptions[0]?.filePath || '';
              const status = localImageStatusByKey[key];
              const selectedImageOption =
                imageOptions.find((option) => option.filePath === selectedImage) || null;
              const selectedImageLabel =
                selectedImageOption?.relativePath || selectedImageOption?.fileName || selectedImage;
              const isPreviewOpen = hoveredPreviewKey === key && Boolean(selectedImage);

              return (
                <div key={key} className="card" style={{ background: '#f8faf8' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{selectedProduct?.title || `Furniture type: ${furnitureType}`}</strong>
                    <span className="mono">{selectedProduct?.handle || 'no-product-handle'}</span>
                  </div>
                  <p className="mono" style={{ margin: '0.35rem 0 0.6rem' }}>
                    Furniture type: {furnitureType}
                  </p>
                  <label htmlFor={`img-${key}`}>Choose image</label>
                  <select
                    id={`img-${key}`}
                    value={selectedImage}
                    onChange={(event) => setSelectedImage(key, event.target.value)}
                    disabled={!imageOptions.length}
                  >
                    {imageOptions.length ? (
                      imageOptions.map((option) => (
                        <option key={option.filePath} value={option.filePath}>
                          {option.relativePath || option.fileName}
                        </option>
                      ))
                    ) : (
                      <option value="">No images available</option>
                    )}
                  </select>
                  {selectedImage ? (
                    <p
                      className="mono"
                      style={{
                        margin: '0.55rem 0 0',
                        color: '#14532d'
                      }}
                    >
                      Selected file: {selectedImage}
                    </p>
                  ) : null}
                  {selectedImage ? (
                    <div
                      style={{ marginTop: '0.45rem', position: 'relative', display: 'inline-block' }}
                      onMouseEnter={() => showImagePreview(key)}
                      onMouseLeave={() => hideImagePreview(key)}
                    >
                      <a
                        href={selectedImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="mono"
                        onFocus={() => showImagePreview(key)}
                        onBlur={() => hideImagePreview(key)}
                      >
                        Download selected image
                      </a>
                      {isPreviewOpen ? (
                        <div
                          role="dialog"
                          aria-label={`Image preview for ${furnitureType}`}
                          style={{
                            position: 'absolute',
                            zIndex: 20,
                            left: 0,
                            top: 'calc(100% + 0.45rem)',
                            width: 'min(360px, 72vw)',
                            padding: '0.5rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            boxShadow: '0 18px 38px rgba(0, 0, 0, 0.18)'
                          }}
                        >
                          <p className="mono" style={{ margin: '0 0 0.45rem', fontSize: '0.8rem' }}>
                            {selectedImageLabel}
                          </p>
                          <img
                            src={selectedImage}
                            alt={`Preview for ${furnitureType}`}
                            style={{
                              display: 'block',
                              width: '100%',
                              height: 'auto',
                              borderRadius: '0.35rem',
                              border: '1px solid #e5e7eb',
                              background: '#f9fafb'
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {status ? (
                    <p className="mono" style={{ margin: '0.55rem 0 0', color: '#991b1b' }}>
                      {status}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
