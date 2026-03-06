'use client';

import { useState } from 'react';
import Link from 'next/link';

const DEFAULT_PRESET_SLUG = 'living-room-corner-warm-minimal';

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomSubset(items, min = 2, max = 4) {
  const source = [...new Set(items)].filter(Boolean);
  if (!source.length) return [];
  const lower = Math.max(1, Math.min(min, source.length));
  const upper = Math.max(lower, Math.min(max, source.length));
  const count = Math.floor(Math.random() * (upper - lower + 1)) + lower;
  return [...source].sort(() => Math.random() - 0.5).slice(0, count);
}

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(false);

  async function handleRandomize() {
    setLoading(true);
    setError('');
    setPrompt('');

    try {
      // 1. Load room options from the sheet
      const roomRes = await fetch('/api/room-options');
      const roomPayload = await roomRes.json();
      if (!roomRes.ok || !roomPayload.ok) throw new Error(roomPayload.error || 'Failed to load options');

      const roomOptions = roomPayload.roomOptions || [];
      if (!roomOptions.length) throw new Error('No room options available');

      // 2. Pick random values from different rows (crossmix style)
      const shuffled = [...roomOptions].sort(() => Math.random() - 0.5);
      const rowA = shuffled[0]; // style tag + room
      const rowB = shuffled[1] || shuffled[0]; // furniture types

      const tagsA = Array.isArray(rowA?.styleTags) ? rowA.styleTags.filter(Boolean) : [];
      const styleTag = pickRandom(tagsA) || '';

      const roomType = rowA?.roomType || '';

      const furniturePool = Array.isArray(rowB?.furnitureTypes)
        ? rowB.furnitureTypes.filter(Boolean)
        : Array.isArray(rowA?.furnitureTypes)
          ? rowA.furnitureTypes.filter(Boolean)
          : [];
      const furnitureTypes = pickRandomSubset(furniturePool, 2, 4);

      // 3. Generate the prompt
      const genRes = await fetch('/api/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetSlug: DEFAULT_PRESET_SLUG,
          roomType,
          furnitureTypes,
          featuredProductsByType: {},
          styleTags: styleTag ? [styleTag] : [],
          variationSeed: Math.floor(Math.random() * 100)
        })
      });
      const genPayload = await genRes.json();
      if (!genRes.ok || !genPayload.ok) throw new Error(genPayload.error || 'Failed to generate prompt');

      setPrompt(genPayload.prompt || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setToast(true);
      setTimeout(() => setToast(false), 2000);
    } catch {}
  }

  return (
    <main>
      <h1>HTGT Prompt Generator</h1>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: prompt ? '0.75rem' : 0 }}>
          <button
            type="button"
            onClick={handleRandomize}
            disabled={loading}
            style={{ fontWeight: 600 }}
          >
            {loading ? 'Generating…' : '↺ Randomize Prompt'}
          </button>

          {prompt && (
            <button type="button" onClick={handleCopy} style={{ flexShrink: 0 }}>
              Copy
            </button>
          )}
        </div>

        {error && (
          <p style={{ color: '#991b1b', margin: 0, fontSize: '0.875rem' }}>{error}</p>
        )}

        {prompt && (
          <textarea
            readOnly
            value={prompt}
            style={{ marginTop: '0.5rem' }}
          />
        )}
      </div>

      <div className="row">
        <Link href="/generator">Open Generator</Link>
        <Link href="/blob-manager">Manage Blob Images</Link>
      </div>

      {/* Copy toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1e3a5f',
          color: '#fff',
          padding: '0.5rem 1.25rem',
          borderRadius: '2rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          pointerEvents: 'none',
          zIndex: 9999
        }}>
          Copied to clipboard
        </div>
      )}
    </main>
  );
}
