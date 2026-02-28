import './globals.css';

export const metadata = {
  title: 'HTGT Prompt Generator',
  description: 'Deterministic prompt generator'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
