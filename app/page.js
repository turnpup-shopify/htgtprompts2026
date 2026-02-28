import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>HTGT Prompt Generator</h1>
      <p>Use the deterministic generator page to sync products and build prompts.</p>
      <Link href="/generator">Open Generator</Link>
    </main>
  );
}
