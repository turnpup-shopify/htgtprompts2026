'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

function sanitizeFilename(value, fallback = 'image') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
}

function filenameFromUrl(url, fallback = 'image') {
  try {
    const parsed = new URL(String(url || ''));
    const last = parsed.pathname.split('/').pop() || '';
    return sanitizeFilename(decodeURIComponent(last), fallback);
  } catch {
    return sanitizeFilename(String(url || '').split('/').pop(), fallback);
  }
}

function Tooltip({ text }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span style={{
        cursor: 'default',
        fontSize: '0.65rem',
        color: '#9ca3af',
        border: '1px solid #d1d5db',
        borderRadius: '50%',
        width: '1rem',
        height: '1rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        lineHeight: 1,
        flexShrink: 0,
      }}>?</span>
      {visible && (
        <span style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1f2523',
          color: '#fff',
          fontSize: '0.73rem',
          padding: '0.4rem 0.55rem',
          borderRadius: '6px',
          width: '190px',
          lineHeight: 1.45,
          zIndex: 20,
          pointerEvents: 'none',
          whiteSpace: 'normal',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

export default function GeneratorPage() {
  const [roomOptions, setRoomOptions] = useState([]);
  const [sceneOptions, setSceneOptions] = useState([]);
  const [selectedScene, setSelectedScene] = useState('');
  const [selectedStyleTag, setSelectedStyleTag] = useState('');
  const [roomType, setRoomType] = useState('');
  const [selectedFurnitureTypes, setSelectedFurnitureTypes] = useState([]);
  const [customFurnitureType, setCustomFurnitureType] = useState('');
  const [productOptionsByType, setProductOptionsByType] = useState({});
  const [featuredProductsByType, setFeaturedProductsByType] = useState({});
  const [roomOptionsLoading, setRoomOptionsLoading] = useState(true);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [catalogSource, setCatalogSource] = useState('sheets');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [selectedImageByKey, setSelectedImageByKey] = useState({});
  const [localImageOptionsByKey, setLocalImageOptionsByKey] = useState({});
  const [downloadAllLoading, setDownloadAllLoading] = useState(false);
  const [downloadAllError, setDownloadAllError] = useState('');
  const [variationSeed, setVariationSeed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [promptHistory, setPromptHistory] = useState([]);
  const [savedPrompts, setSavedPrompts] = useState([]);
  const [batchResults, setBatchResults] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // Load saved prompts from localStorage on mount
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('htgt_saved_prompts') || '[]');
      setSavedPrompts(stored);
    } catch {}
  }, []);

  // Holds furniture from a cross-row mix; tells the furnitureOptionsForRoom effect to
  // skip its normal randomisation so the mixed selection survives the room-type change.
  const pendingMixedFurnitureRef = useRef(null);

  const allStyleTagOptions = useMemo(() => {
    const set = new Set();

    for (const room of roomOptions) {
      const tags = Array.isArray(room?.styleTags) ? room.styleTags : [];
      for (const tag of tags) {
        const normalized = String(tag || '').trim().toLowerCase();
        if (normalized) set.add(normalized);
      }
    }

    return [...set].sort((a, b) => a.localeCompare(b));
  }, [roomOptions]);

  const filteredRoomOptions = useMemo(() => {
    let options = roomOptions;
    if (allStyleTagOptions.length && selectedStyleTag) {
      options = options.filter((item) => {
        const tags = Array.isArray(item?.styleTags) ? item.styleTags : [];
        return tags.includes(selectedStyleTag);
      });
    }
    if (selectedScene) {
      const sceneEntry = sceneOptions.find((s) => s.scene === selectedScene);
      const sceneRooms = sceneEntry?.rooms || [];
      options = options.filter((item) => sceneRooms.includes(item.roomType));
    }
    return options;
  }, [roomOptions, allStyleTagOptions, selectedStyleTag, selectedScene, sceneOptions]);

  const availableScenesForRoom = useMemo(() => {
    if (!roomType) return sceneOptions;
    return sceneOptions.filter((s) => s.rooms.includes(roomType));
  }, [sceneOptions, roomType]);

  const roomAutoLocked = useMemo(() => {
    if (!selectedScene) return false;
    const sceneEntry = sceneOptions.find((s) => s.scene === selectedScene);
    return (sceneEntry?.rooms || []).length === 1;
  }, [selectedScene, sceneOptions]);

  const selectedRoomOption = useMemo(
    () => filteredRoomOptions.find((item) => item.roomType === roomType) || null,
    [filteredRoomOptions, roomType]
  );

  const furnitureOptionsForRoom = useMemo(
    () => selectedRoomOption?.furnitureTypes || [],
    [selectedRoomOption]
  );

  const visibleFurnitureTypes = useMemo(() => {
    // Show ALL room furniture types plus any custom types the user added.
    const customTypes = selectedFurnitureTypes.filter(
      (type) => !furnitureOptionsForRoom.includes(type)
    );
    const merged = [...furnitureOptionsForRoom, ...customTypes];
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

  const selectedImagesForPrompt = useMemo(() => {
    const promptFurnitureTypes = Array.isArray(result?.input?.furnitureTypes)
      ? result.input.furnitureTypes
      : [];
    const targetTypes = promptFurnitureTypes.length ? promptFurnitureTypes : selectedFurnitureTypes;
    const uniqueByUrl = new Map();

    for (const furnitureType of targetTypes) {
      const key = String(furnitureType || '').trim().toLowerCase();
      if (!key) continue;

      const options = localImageOptionsByKey[key] || [];
      const selectedImageUrl = selectedImageByKey[key] || options[0]?.filePath || '';
      if (!selectedImageUrl) continue;

      if (uniqueByUrl.has(selectedImageUrl)) continue;
      const option = options.find((item) => item.filePath === selectedImageUrl);
      const originalName =
        option?.fileName ||
        option?.relativePath ||
        filenameFromUrl(selectedImageUrl, `${sanitizeFilename(key, 'furniture')}.jpg`);
      const prefixedName = `${sanitizeFilename(key, 'furniture')}-${sanitizeFilename(
        originalName,
        'image.jpg'
      )}`;

      uniqueByUrl.set(selectedImageUrl, {
        url: selectedImageUrl,
        fileName: prefixedName
      });
    }

    return [...uniqueByUrl.values()];
  }, [result, selectedFurnitureTypes, localImageOptionsByKey, selectedImageByKey]);

  const canDownloadAllSelectedImages = Boolean(result?.prompt) && selectedImagesForPrompt.length > 0;

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
        setSceneOptions(payload.sceneOptions || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setRoomOptionsLoading(false);
      }
    }

    loadRoomOptions();
  }, []);

  useEffect(() => {
    if (!roomOptions.length) {
      setSelectedStyleTag('');
      return;
    }

    if (!allStyleTagOptions.length) {
      setSelectedStyleTag('');
      return;
    }

    setSelectedStyleTag((current) => {
      if (current === '') return '';
      return allStyleTagOptions.includes(current) ? current : allStyleTagOptions[0];
    });
  }, [roomOptions, allStyleTagOptions]);

  useEffect(() => {
    if (!filteredRoomOptions.length) {
      setRoomType('');
      return;
    }

    setRoomType((current) => {
      if (current === '') return '';
      return filteredRoomOptions.some((item) => item.roomType === current)
        ? current
        : filteredRoomOptions[0].roomType;
    });
  }, [filteredRoomOptions]);

  // When scene maps to exactly one room, auto-select it.
  useEffect(() => {
    if (!roomAutoLocked) return;
    const sceneEntry = sceneOptions.find((s) => s.scene === selectedScene);
    const onlyRoom = sceneEntry?.rooms[0];
    if (onlyRoom) setRoomType(onlyRoom);
  }, [roomAutoLocked, selectedScene, sceneOptions]);

  useEffect(() => {
    if (!furnitureOptionsForRoom.length) {
      setSelectedFurnitureTypes([]);
      pendingMixedFurnitureRef.current = null;
      return;
    }

    // If Mix It Up pre-loaded a cross-row furniture selection, keep it and don't override.
    if (pendingMixedFurnitureRef.current !== null) {
      pendingMixedFurnitureRef.current = null;
      return;
    }

    setSelectedFurnitureTypes(pickRandomSubset(furnitureOptionsForRoom, 2, 4));
  }, [furnitureOptionsForRoom]);

  // Load product options for ALL furniture types in the room.
  useEffect(() => {
    if (!roomType || !furnitureOptionsForRoom.length) {
      setProductOptionsByType({});
      setFeaturedProductsByType({});
      return;
    }

    let isCancelled = false;

    async function loadAllRoomProductOptions() {
      setProductOptionsLoading(true);
      setError('');

      try {
        const response = await fetch('/api/product-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomType,
            furnitureTypes: furnitureOptionsForRoom
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
          for (const type of furnitureOptionsForRoom) {
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

    loadAllRoomProductOptions();

    return () => {
      isCancelled = true;
    };
  }, [roomType, furnitureOptionsForRoom]);

  // For custom furniture types (added by the user, not in the room sheet), load their options
  // separately and merge them into productOptionsByType.
  useEffect(() => {
    const customTypes = selectedFurnitureTypes.filter(
      (type) => !furnitureOptionsForRoom.includes(type)
    );

    if (!roomType || !customTypes.length) return;

    let isCancelled = false;

    async function loadCustomTypeOptions() {
      try {
        const response = await fetch('/api/product-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomType, furnitureTypes: customTypes })
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok || isCancelled) return;

        const optionsByType = payload.optionsByFurnitureType || {};
        setProductOptionsByType((current) => ({ ...current, ...optionsByType }));
      } catch {
        // Custom type options are best-effort; ignore errors.
      }
    }

    loadCustomTypeOptions();

    return () => {
      isCancelled = true;
    };
  }, [roomType, selectedFurnitureTypes, furnitureOptionsForRoom]);

  useEffect(() => {
    if (!selectedFurnitureTypes.length) {
      setLocalImageOptionsByKey({});
      return;
    }

    let isCancelled = false;

    async function loadLocalImages() {
      const nextOptions = {};

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
        } catch {
          nextOptions[key] = [];
        }
      }

      if (isCancelled) return;

      setLocalImageOptionsByKey(nextOptions);
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

  function handleClearAll() {
    setSelectedScene('');
    setSelectedStyleTag('');
    setRoomType('');
    setSelectedFurnitureTypes([]);
    setFeaturedProductsByType({});
    setSelectedImageByKey({});
    setResult(null);
    setError('');
  }

  function randomizeFurnitureSet() {
    setSelectedFurnitureTypes(pickRandomSubset(furnitureOptionsForRoom, 2, 4));
  }

  function computeCrossmixInput() {
    if (roomOptions.length < 2) return null;
    const shuffled = [...roomOptions].sort(() => Math.random() - 0.5);
    const rowA = shuffled[0]; // contributes: style tag + room type
    const rowB = shuffled[1]; // contributes: furniture types
    const tagsA = Array.isArray(rowA?.styleTags) ? rowA.styleTags.filter(Boolean) : [];
    const styleTag = tagsA.length ? tagsA[Math.floor(Math.random() * tagsA.length)] : '';
    const furnitureB = Array.isArray(rowB?.furnitureTypes) ? rowB.furnitureTypes.filter(Boolean) : [];
    return {
      roomType: rowA?.roomType || '',
      styleTags: styleTag ? [styleTag] : [],
      furnitureTypes: furnitureB.length ? pickRandomSubset(furnitureB, 2, 4) : [],
      featuredProductsByType: {},
    };
  }

  function handleMixItUp() {
    const input = computeCrossmixInput();
    if (!input) return;

    if (input.furnitureTypes.length) {
      pendingMixedFurnitureRef.current = input.furnitureTypes;
      setSelectedFurnitureTypes(input.furnitureTypes);
    }
    setSelectedStyleTag(input.styleTags[0] || '');
    if (input.roomType) setRoomType(input.roomType);
  }

  function selectAllFurniture() {
    setSelectedFurnitureTypes([...visibleFurnitureTypes]);
  }

  function clearAllFurniture() {
    setSelectedFurnitureTypes([]);
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

  async function handleDownloadAllSelectedImages() {
    if (!canDownloadAllSelectedImages || downloadAllLoading) return;
    setDownloadAllLoading(true);
    setDownloadAllError('');

    try {
      for (const item of selectedImagesForPrompt) {
        const response = await fetch(item.url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to download ${item.fileName} (${response.status}).`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = item.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);

        // Space downloads slightly so browsers do not collapse multiple clicks.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    } catch (err) {
      setDownloadAllError(err?.message || 'Failed to download selected images.');
    } finally {
      setDownloadAllLoading(false);
    }
  }

  async function runGenerate(seed, overrides = {}) {
    const response = await fetch('/api/generate-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presetSlug: DEFAULT_PRESET_SLUG,
        roomType: overrides.roomType !== undefined ? overrides.roomType : roomType,
        scene: overrides.scene !== undefined ? overrides.scene : (selectedScene || undefined),
        furnitureTypes: overrides.furnitureTypes !== undefined ? overrides.furnitureTypes : selectedFurnitureTypes,
        featuredProductsByType: overrides.featuredProductsByType !== undefined ? overrides.featuredProductsByType : featuredProductsByType,
        styleTags: overrides.styleTags !== undefined ? overrides.styleTags : (selectedStyleTag ? [selectedStyleTag] : []),
        variationSeed: seed
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to generate prompt');
    return payload;
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = await runGenerate(variationSeed);
      setResult(payload);
      setPromptHistory((prev) => [
        { id: Date.now(), prompt: payload.prompt, input: payload.input, seed: variationSeed },
        ...prev.slice(0, 9)
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVariation() {
    const nextSeed = variationSeed + 1;
    setVariationSeed(nextSeed);
    setLoading(true);
    setError('');
    try {
      const payload = await runGenerate(nextSeed);
      setResult(payload);
      setPromptHistory((prev) => [
        { id: Date.now(), prompt: payload.prompt, input: payload.input, seed: nextSeed },
        ...prev.slice(0, 9)
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchGenerate() {
    setBatchLoading(true);
    setBatchResults([]);
    setError('');
    try {
      const results = [];
      for (let s = 0; s < 5; s++) {
        const input = computeCrossmixInput() || {};
        // eslint-disable-next-line no-await-in-loop
        const result = await runGenerate(s, input).catch((err) => ({ error: err.message }));
        results.push(result);
        setBatchResults([...results]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleCopyPrompt(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  function toggleSavePrompt(promptText) {
    setSavedPrompts((prev) => {
      const next = prev.some((p) => p.text === promptText)
        ? prev.filter((p) => p.text !== promptText)
        : [{ id: Date.now(), text: promptText }, ...prev];
      try { localStorage.setItem('htgt_saved_prompts', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function isPromptSaved(text) {
    return savedPrompts.some((p) => p.text === text);
  }

  const imageCatalogContent = (() => {
    if (!selectedFurnitureTypes.length) return null;

    const typesWithImages = selectedFurnitureTypes.filter(
      (type) => (localImageOptionsByKey[type] || []).length > 0
    );
    const typesWithoutImages = selectedFurnitureTypes.filter(
      (type) => type in localImageOptionsByKey && (localImageOptionsByKey[type] || []).length === 0
    );

    if (typesWithImages.length === 0 && typesWithoutImages.length === 0) {
      return <p className="mono" style={{ margin: 0, color: '#6b7280' }}>Loading images...</p>;
    }

    return (
      <>
        {typesWithImages.length > 0 && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {typesWithImages.map((furnitureType) => {
              const key = furnitureType;
              const selectedProduct = selectedProductByFurnitureType[furnitureType];
              const imageOptions = localImageOptionsByKey[key] || [];
              const selectedImage = selectedImageByKey[key] || imageOptions[0]?.filePath || '';
              const selectedImageOption = imageOptions.find((o) => o.filePath === selectedImage) || null;

              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{furnitureType}</strong>
                    {selectedProduct?.handle && (
                      <span className="mono" style={{ fontSize: '0.7rem', color: '#6b7280' }}>{selectedProduct.handle}</span>
                    )}
                  </div>
                  <div style={{ aspectRatio: '4/3', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: '#f9fafb', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedImage ? (
                      <img src={selectedImage} alt={furnitureType} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span className="mono" style={{ fontSize: '0.75rem', color: '#9ca3af' }}>no image</span>
                    )}
                  </div>
                  <select
                    value={selectedImage}
                    onChange={(event) => setSelectedImage(key, event.target.value)}
                    disabled={!imageOptions.length}
                    style={{ fontSize: '0.8rem' }}
                  >
                    {imageOptions.map((option) => (
                      <option key={option.filePath} value={option.filePath}>
                        {option.relativePath || option.fileName}
                      </option>
                    ))}
                  </select>
                  {selectedImage && (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <a href={selectedImage} target="_blank" rel="noopener noreferrer" download className="mono" style={{ fontSize: '0.75rem' }}>Download</a>
                      <a href={selectedImage} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: '0.75rem' }}>Open</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {typesWithoutImages.length > 0 && (
          <details style={{ marginTop: typesWithImages.length > 0 ? '0.75rem' : 0 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280', userSelect: 'none' }}>
              No images: {typesWithoutImages.join(', ')}
            </summary>
          </details>
        )}
      </>
    );
  })();

  return (
    <main>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0 }}>Prompt Generator</h1>
        <span className="mono" style={{ fontSize: '0.72rem', color: '#c0c8bf', letterSpacing: '0.02em' }}>
          {catalogSource === 'shopify' ? 'shopify' : 'sheets'} · {roomOptionsLoading ? '…' : `${roomOptions.length} rooms`}
        </span>
      </div>

      <div className="grid grid-2">
        {/* ── Left: Controls ── */}
        <section className="card">
          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
            <button type="button" onClick={handleClearAll} style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', background: 'transparent', color: '#9ca3af', border: '1px solid #e5e7eb' }}>
              Clear all
            </button>
          </div>

          <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {/* Style Tag */}
              <div>
                <label htmlFor="styleTag" style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>Style</label>
                <div className="row" style={{ gap: '0.4rem' }}>
                  <select
                    id="styleTag"
                    value={selectedStyleTag}
                    onChange={(event) => setSelectedStyleTag(event.target.value)}
                    disabled={roomOptionsLoading || !allStyleTagOptions.length}
                    style={{ flex: 1 }}
                  >
                    <option value="">Any style</option>
                    {allStyleTagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={allStyleTagOptions.length < 2}
                    onClick={() => {
                      const others = allStyleTagOptions.filter((t) => t !== selectedStyleTag);
                      setSelectedStyleTag(others[Math.floor(Math.random() * others.length)]);
                    }}
                    style={{ flexShrink: 0 }}
                    title="Random style"
                  >↺</button>
                </div>
              </div>

              {/* Scene */}
              {sceneOptions.length > 0 && (
                <div>
                  <label htmlFor="scene" style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
                    Scene{selectedScene ? '' : ' — optional'}
                    {roomAutoLocked && <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>· room auto-selected</span>}
                  </label>
                  <div className="row" style={{ gap: '0.4rem' }}>
                    <select
                      id="scene"
                      value={selectedScene}
                      onChange={(event) => setSelectedScene(event.target.value)}
                      disabled={roomOptionsLoading}
                      style={{ flex: 1 }}
                    >
                      <option value="">Any</option>
                      {availableScenesForRoom.map((s) => (
                        <option key={s.scene} value={s.scene}>
                          {s.scene}{s.rooms.length === 1 ? ` — ${s.rooms[0]}` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedScene && (
                      <button type="button" onClick={() => setSelectedScene('')} style={{ flexShrink: 0 }} title="Clear scene">✕</button>
                    )}
                  </div>
                </div>
              )}

              {/* Room */}
              <div>
                <label htmlFor="roomType" style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>Room</label>
                <div className="row" style={{ gap: '0.4rem' }}>
                  <select
                    id="roomType"
                    value={roomType}
                    onChange={(event) => { setRoomType(event.target.value); setSelectedScene(''); }}
                    disabled={roomOptionsLoading || !filteredRoomOptions.length || roomAutoLocked}
                    style={{ flex: 1 }}
                  >
                    <option value="">Any room</option>
                    {filteredRoomOptions.map((item) => <option key={item.roomType} value={item.roomType}>{item.roomType}</option>)}
                  </select>
                  {!roomAutoLocked && (
                    <button
                      type="button"
                      disabled={filteredRoomOptions.length < 2}
                      onClick={() => {
                        const others = filteredRoomOptions.filter((r) => r.roomType !== roomType);
                        setRoomType(others[Math.floor(Math.random() * others.length)].roomType);
                        setSelectedScene('');
                      }}
                      style={{ flexShrink: 0 }}
                      title="Random room"
                    >↺</button>
                  )}
                </div>
              </div>
            </div>

            {/* Divider */}
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: 0 }} />

            {/* Furniture */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Furniture</label>
                <div className="row" style={{ gap: '0.3rem' }}>
                  <button type="button" onClick={randomizeFurnitureSet} disabled={!furnitureOptionsForRoom.length} style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem' }} title="Pick random set">↺ Random</button>
                  <button type="button" onClick={selectAllFurniture} disabled={!visibleFurnitureTypes.length} style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}>All</button>
                  <button type="button" onClick={clearAllFurniture} disabled={!selectedFurnitureTypes.length} style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}>None</button>
                </div>
              </div>

              {!furnitureOptionsForRoom.length ? (
                <p className="mono" style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>Select a room first.</p>
              ) : (
                <div className="checkbox-grid">
                  {visibleFurnitureTypes.map((type) => {
                    const count = (productOptionsByType[type] || []).length;
                    return (
                      <label key={type} className="checkbox-item">
                        <input type="checkbox" checked={selectedFurnitureTypes.includes(type)} onChange={() => toggleFurnitureType(type)} />{' '}{type}
                        {count > 0 && <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem', color: '#9ca3af' }}>({count})</span>}
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="row" style={{ marginTop: '0.6rem', gap: '0.4rem' }}>
                <input
                  value={customFurnitureType}
                  onChange={(event) => setCustomFurnitureType(event.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomFurnitureType(); } }}
                  placeholder="Add custom type…"
                  style={{ fontSize: '0.85rem' }}
                />
                <button type="button" onClick={addCustomFurnitureType} style={{ flexShrink: 0 }}>Add</button>
              </div>
            </div>

            {/* Featured Products */}
            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, userSelect: 'none', color: '#374151' }}>
                Pin products{selectedFurnitureTypes.some((t) => featuredProductsByType[t]) ? ' ·' : ' — optional'}
                {selectedFurnitureTypes.some((t) => featuredProductsByType[t]) && (
                  <span style={{ color: '#6b7280', fontWeight: 400 }}>
                    {' '}{selectedFurnitureTypes.filter((t) => featuredProductsByType[t]).length} pinned
                  </span>
                )}
              </summary>
              <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {productOptionsLoading ? (
                  <p className="mono" style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>Loading…</p>
                ) : selectedFurnitureTypes.length === 0 ? (
                  <p className="mono" style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>Select furniture types first.</p>
                ) : (
                  selectedFurnitureTypes.map((type) => {
                    const options = productOptionsByType[type] || [];
                    return (
                      <div key={type}>
                        <label htmlFor={`featured-${type}`} style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.2rem', display: 'block' }}>{type}</label>
                        <select
                          id={`featured-${type}`}
                          value={featuredProductsByType[type] || ''}
                          onChange={(event) => setFeaturedProduct(type, event.target.value)}
                        >
                          <option value="">Auto-pick</option>
                          {options.map((option) => (
                            <option key={option.shopify_product_id} value={option.shopify_product_id}>
                              {option.title}{option.catalog_origin === 'blob' ? ' (blob)' : option.catalog_origin === 'local' ? ' (local)' : ''}{option.in_stock ? '' : ' (OOS)'}
                            </option>
                          ))}
                        </select>
                        {options.length === 0 && (
                          <p className="mono" style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>No products found for this type.</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </details>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
              <button
                type="submit"
                disabled={loading || batchLoading}
                style={{ fontWeight: 700, fontSize: '1rem', padding: '0.8rem', letterSpacing: '0.01em' }}
              >
                {loading ? 'Generating…' : 'Generate Prompt'}
              </button>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
                  <button
                    type="button"
                    onClick={handleVariation}
                    disabled={loading || batchLoading || !result}
                    style={{ flex: 1, background: '#f1f5f9', color: '#374151' }}
                  >
                    ↺ Variation
                  </button>
                  <Tooltip text="Same room and furniture, different seed. Swaps in a fresh set of products without changing any of your settings." />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={handleMixItUp}
                    disabled={roomOptions.length < 2 || loading || batchLoading}
                    style={{ background: '#1e3a5f', color: '#fff' }}
                  >
                    Crossmix
                  </button>
                  <Tooltip text="Splices a style + room from one random data row with furniture types from a completely different row. Forces unexpected combinations." />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <button
                  type="button"
                  onClick={handleBatchGenerate}
                  disabled={loading || batchLoading}
                  style={{ flex: 1, background: '#f8faf8', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.875rem' }}
                >
                  {batchLoading ? `Generating ${batchResults.length + 1} of 5…` : 'Batch × 5'}
                </button>
                <Tooltip text="Generates 5 crossmix prompts in a row — each gets a freshly randomized room, style, and furniture combo." />
              </div>
            </div>

            {error && <p style={{ color: '#991b1b', margin: 0, fontSize: '0.875rem' }}>{error}</p>}
          </form>
        </section>

        {/* ── Right: Output + Images ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#6b7280' }}>Output</h2>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <a
                  href="https://higgsfield.ai/image/nano_banana_2"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', background: '#1e3a5f', color: '#fff', borderRadius: '0.35rem', textDecoration: 'none', fontWeight: 600 }}
                >
                  Generate ↗
                </a>
                <a
                  href="https://turnpup-shopify.github.io/prompts/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', background: '#f1f5f9', color: '#374151', borderRadius: '0.35rem', textDecoration: 'none', fontWeight: 600 }}
                >
                  Prompts ↗
                </a>
              </div>
            </div>
            <textarea
              readOnly
              value={result?.prompt || ''}
              placeholder="Generated prompt will appear here…"
              style={{ minHeight: '260px' }}
            />
            {result?.prompt && (
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => handleCopyPrompt(result.prompt)} style={{ flexShrink: 0, background: copied ? '#d1fae5' : undefined, color: copied ? '#065f46' : undefined, transition: 'background 0.2s' }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSavePrompt(result.prompt)}
                  style={{ flexShrink: 0, background: isPromptSaved(result.prompt) ? '#fef9c3' : '#f1f5f9', color: '#374151' }}
                >
                  {isPromptSaved(result.prompt) ? '★ Saved' : '☆ Save'}
                </button>
                {canDownloadAllSelectedImages && (
                  <button
                    type="button"
                    onClick={handleDownloadAllSelectedImages}
                    disabled={downloadAllLoading}
                    style={{ background: '#f1f5f9', color: '#374151' }}
                  >
                    {downloadAllLoading
                      ? `Downloading…`
                      : `↓ Images (${selectedImagesForPrompt.length})`}
                  </button>
                )}
                {downloadAllError && (
                  <span className="mono" style={{ color: '#991b1b', fontSize: '0.8rem' }}>{downloadAllError}</span>
                )}
              </div>
            )}
          </section>

          {imageCatalogContent && (
            <section className="card">
              <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Images</h2>
              {imageCatalogContent}
            </section>
          )}
        </div>
      </div>

      {/* Batch results */}
      {(batchResults.length > 0 || batchLoading) && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Batch Results</h2>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} style={{
                  width: '0.5rem', height: '0.5rem', borderRadius: '50%',
                  background: i < batchResults.length ? '#2d3b34' : '#e5e7eb',
                  transition: 'background 0.3s',
                }} />
              ))}
              <span className="mono" style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: '0.3rem' }}>
                {batchResults.length}/5
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {batchResults.map((r, i) => (
              <details key={i} style={{ background: '#f8faf8', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                <summary style={{ padding: '0.6rem 0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ display: 'inline-flex', justifyContent: 'space-between', alignItems: 'center', width: 'calc(100% - 1rem)', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Mix {i + 1}</span>
                      {r.input?.roomType && (
                        <span className="mono" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                          {r.input.roomType}{r.input.styleTags?.[0] ? ` · ${r.input.styleTags[0]}` : ''}
                        </span>
                      )}
                      {r.error && <span className="mono" style={{ fontSize: '0.7rem', color: '#991b1b' }}>error</span>}
                    </div>
                    {r.prompt && (
                      <div style={{ display: 'flex', gap: '0.3rem' }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => handleCopyPrompt(r.prompt)} style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>Copy</button>
                        <button
                          type="button"
                          onClick={() => toggleSavePrompt(r.prompt)}
                          style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: isPromptSaved(r.prompt) ? '#fef9c3' : '#f1f5f9', color: '#374151' }}
                        >
                          {isPromptSaved(r.prompt) ? '★' : '☆'}
                        </button>
                      </div>
                    )}
                  </div>
                </summary>
                <div style={{ padding: '0 0.75rem 0.75rem', borderTop: '1px solid #e5e7eb' }}>
                  {r.error
                    ? <p className="mono" style={{ margin: '0.6rem 0 0', color: '#991b1b', fontSize: '0.8rem' }}>{r.error}</p>
                    : <p style={{ margin: '0.6rem 0 0', fontSize: '0.82rem', whiteSpace: 'pre-wrap', lineHeight: 1.55, color: '#1f2523' }}>{r.prompt}</p>
                  }
                </div>
              </details>
            ))}
            {batchLoading && batchResults.length < 5 && (
              <div style={{ background: '#f8faf8', borderRadius: '0.5rem', padding: '0.65rem 0.75rem', border: '1px dashed #e5e7eb' }}>
                <span className="mono" style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Generating mix {batchResults.length + 1}…</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Prompt history */}
      {promptHistory.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '0.6rem 0.75rem', background: '#f1f5f9', borderRadius: '0.5rem', userSelect: 'none', fontSize: '0.85rem' }}>
            History ({promptHistory.length})
          </summary>
          <section className="card" style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {promptHistory.map((item) => (
              <div key={item.id} style={{ background: '#f8faf8', borderRadius: '0.5rem', padding: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span className="mono" style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {item.input?.roomType || '—'}{item.input?.scene ? ` · ${item.input.scene}` : ''} · v{item.seed + 1}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" onClick={() => handleCopyPrompt(item.prompt)} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>Copy</button>
                    <button
                      type="button"
                      onClick={() => toggleSavePrompt(item.prompt)}
                      style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: isPromptSaved(item.prompt) ? '#fef9c3' : undefined }}
                    >
                      {isPromptSaved(item.prompt) ? '★' : '☆'}
                    </button>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#374151' }}>{item.prompt}</p>
              </div>
            ))}
          </section>
        </details>
      )}

      {/* Saved prompts */}
      {savedPrompts.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '0.6rem 0.75rem', background: '#fef9c3', borderRadius: '0.5rem', userSelect: 'none', fontSize: '0.85rem' }}>
            ★ Saved ({savedPrompts.length})
          </summary>
          <section className="card" style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {savedPrompts.map((item) => (
              <div key={item.id} style={{ background: '#fefce8', borderRadius: '0.5rem', padding: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" onClick={() => handleCopyPrompt(item.text)} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>Copy</button>
                    <button type="button" onClick={() => toggleSavePrompt(item.text)} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>★ Remove</button>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#374151' }}>{item.text}</p>
              </div>
            ))}
          </section>
        </details>
      )}

      {/* Debug */}
      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '0.6rem 0.75rem', background: '#f1f5f9', borderRadius: '0.5rem', userSelect: 'none', fontSize: '0.85rem' }}>
          Debug
        </summary>
        <section className="card" style={{ marginTop: '0.5rem' }}>
          <pre className="mono" style={{ overflowX: 'auto', margin: 0, fontSize: '0.75rem' }}>
            {JSON.stringify(
              result ? { input: result.input, selectedProduct: result.selectedProduct, selectedProducts: result.selectedProducts, scoreBreakdown: result.scoreBreakdown, debug: result.debug }
                     : { input: null, selectedProduct: null, selectedProducts: null, scoreBreakdown: null, debug: null },
              null, 2
            )}
          </pre>
        </section>
      </details>
    </main>
  );
}
