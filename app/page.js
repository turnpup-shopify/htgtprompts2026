import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>HTGT Prompt Generator</h1>
      <p>Use the deterministic generator page to sync products and build prompts.</p>
      <div className="row">
        <Link href="/generator">Open Generator</Link>
        <Link href="/blob-manager">Manage Blob Images</Link>
      </div>
    </main>
  );
}
