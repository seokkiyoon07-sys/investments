import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FnGuide Report Dashboard',
  description: 'FnGuide report dashboard rebuilt with Next.js'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
