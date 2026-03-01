'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function joinPath(...parts) {
  return parts
    .map((part) =>
      String(part || '')
        .trim()
        .replace(/^\/+|\/+$/g, '')
    )
    .filter(Boolean)
    .join('/');
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BlobManagerPage() {
  const [prefix, setPrefix] = useState('');
  const [configuredDefaultPrefix, setConfiguredDefaultPrefix] = useState('');
  const [blobs, setBlobs] = useState([]);
  const [renameDraftByPath, setRenameDraftByPath] = useState({});
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [replaceOnUpload, setReplaceOnUpload] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [busyPath, setBusyPath] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function loadBlobs({ useDefault = false, explicitPrefix } = {}) {
    setLoadingList(true);
    setError('');
    setStatus('');

    try {
      const params = new URLSearchParams();
      if (!useDefault) {
        params.set('prefix', explicitPrefix !== undefined ? explicitPrefix : prefix);
      }

      const url = `/api/blob-manager/list${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to list blob files.');
      }

      const listed = payload.blobs || [];
      setBlobs(listed);
      setConfiguredDefaultPrefix(payload.configuredDefaultPrefix || '');
      if (useDefault) {
        setPrefix(payload.prefix || '');
      }
      setRenameDraftByPath((current) => {
        const next = {};
        for (const item of listed) {
          const pathname = String(item.pathname || '');
          next[pathname] = current[pathname] || pathname;
        }
        return next;
      });
    } catch (err) {
      setError(err.message || 'Failed to list blob files.');
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadBlobs({ useDefault: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(event) {
    event.preventDefault();
    if (!uploadFiles.length) return;

    setBusyPath('uploading');
    setError('');
    setStatus('');

    try {
      const targetPrefix = joinPath(prefix, uploadFolder);
      const failures = [];

      for (const file of uploadFiles) {
        const form = new FormData();
        form.append('file', file);
        form.append('prefix', targetPrefix);
        form.append('replace', replaceOnUpload ? 'true' : 'false');

        // eslint-disable-next-line no-await-in-loop
        const response = await fetch('/api/blob-manager/upload', {
          method: 'POST',
          body: form
        });
        // eslint-disable-next-line no-await-in-loop
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          failures.push(`${file.name}: ${payload.error || 'upload failed'}`);
        }
      }

      if (failures.length) {
        throw new Error(failures.join(' | '));
      }

      setStatus(`Uploaded ${uploadFiles.length} file(s).`);
      setUploadFiles([]);
      setUploadInputKey((current) => current + 1);
      setUploadFolder('');
      await loadBlobs({ explicitPrefix: prefix });
    } catch (err) {
      setError(err.message || 'Failed to upload file(s).');
    } finally {
      setBusyPath('');
    }
  }

  async function handleRename(pathname) {
    const toPathname = joinPath(renameDraftByPath[pathname]);
    if (!toPathname || toPathname === pathname) return;

    setBusyPath(`rename:${pathname}`);
    setError('');
    setStatus('');

    try {
      const response = await fetch('/api/blob-manager/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPathname: pathname,
          toPathname
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to rename blob file.');
      }

      setStatus(`Renamed ${pathname} -> ${toPathname}`);
      await loadBlobs({ explicitPrefix: prefix });
    } catch (err) {
      setError(err.message || 'Failed to rename blob file.');
    } finally {
      setBusyPath('');
    }
  }

  async function handleDelete(pathname) {
    if (!window.confirm(`Delete ${pathname}?`)) return;

    setBusyPath(`delete:${pathname}`);
    setError('');
    setStatus('');

    try {
      const response = await fetch('/api/blob-manager/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to delete blob file.');
      }

      setStatus(`Deleted ${pathname}`);
      await loadBlobs({ explicitPrefix: prefix });
    } catch (err) {
      setError(err.message || 'Failed to delete blob file.');
    } finally {
      setBusyPath('');
    }
  }

  return (
    <main>
      <h1>Blob Image Manager</h1>
      <p className="mono" style={{ marginTop: '-0.4rem' }}>
        Manage Vercel Blob files: upload, rename, delete.
      </p>
      <p>
        <Link href="/generator">Back to Generator</Link>
      </p>

      <section className="card">
        <h2>Scope</h2>
        <div className="grid grid-2">
          <div>
            <label htmlFor="blob-prefix">Blob Prefix</label>
            <input
              id="blob-prefix"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder={configuredDefaultPrefix || 'items'}
            />
            <p className="mono" style={{ margin: '0.4rem 0 0' }}>
              Empty prefix lists blob root. Default prefix: {configuredDefaultPrefix || '(root)'}.
            </p>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <button type="button" onClick={() => loadBlobs({ explicitPrefix: prefix })} disabled={loadingList}>
              {loadingList ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" onClick={() => loadBlobs({ useDefault: true })} disabled={loadingList}>
              Use Default Prefix
            </button>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Upload</h2>
        <form className="grid" onSubmit={handleUpload}>
          <div>
            <label htmlFor="upload-folder">Subfolder (optional)</label>
            <input
              id="upload-folder"
              value={uploadFolder}
              onChange={(event) => setUploadFolder(event.target.value)}
              placeholder="accent-chair"
            />
          </div>
          <div>
            <label htmlFor="upload-files">Files</label>
            <input
              key={uploadInputKey}
              id="upload-files"
              type="file"
              multiple
              onChange={(event) => setUploadFiles(Array.from(event.target.files || []))}
            />
          </div>
          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={replaceOnUpload}
              onChange={(event) => setReplaceOnUpload(event.target.checked)}
            />
            Replace existing files with same pathname
          </label>
          <button type="submit" disabled={!uploadFiles.length || Boolean(busyPath)}>
            {busyPath === 'uploading' ? 'Uploading...' : `Upload ${uploadFiles.length || ''}`.trim()}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Files ({blobs.length})</h2>
        {error ? (
          <p className="mono" style={{ margin: '0 0 0.6rem', color: '#991b1b' }}>
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="mono" style={{ margin: '0 0 0.6rem', color: '#14532d' }}>
            {status}
          </p>
        ) : null}
        {loadingList ? (
          <p className="mono" style={{ margin: 0 }}>
            Loading files...
          </p>
        ) : blobs.length === 0 ? (
          <p className="mono" style={{ margin: 0 }}>
            No files found for this prefix.
          </p>
        ) : (
          <div className="grid">
            {blobs.map((item) => {
              const pathname = String(item.pathname || '');
              const renameBusy = busyPath === `rename:${pathname}`;
              const deleteBusy = busyPath === `delete:${pathname}`;

              return (
                <div key={pathname} className="card" style={{ background: '#f8faf8' }}>
                  <p className="mono" style={{ margin: 0, wordBreak: 'break-all' }}>
                    {pathname}
                  </p>
                  <p className="mono" style={{ margin: '0.35rem 0 0.6rem' }}>
                    {formatBytes(item.size)} {item.uploadedAt ? `| ${item.uploadedAt}` : ''}
                  </p>
                  <div className="row" style={{ marginBottom: '0.55rem' }}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="mono">
                      Open
                    </a>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" download className="mono">
                      Download
                    </a>
                  </div>
                  <label htmlFor={`rename-${pathname}`} className="mono">
                    Rename Pathname
                  </label>
                  <input
                    id={`rename-${pathname}`}
                    value={renameDraftByPath[pathname] || pathname}
                    onChange={(event) =>
                      setRenameDraftByPath((current) => ({
                        ...current,
                        [pathname]: event.target.value
                      }))
                    }
                  />
                  <div className="row" style={{ marginTop: '0.55rem' }}>
                    <button type="button" onClick={() => handleRename(pathname)} disabled={Boolean(busyPath)}>
                      {renameBusy ? 'Renaming...' : 'Rename'}
                    </button>
                    <button type="button" onClick={() => handleDelete(pathname)} disabled={Boolean(busyPath)}>
                      {deleteBusy ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
