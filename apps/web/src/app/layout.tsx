import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CrossPilot — AI Cross-border Operations Platform',
  description: '面向 Amazon 跨境卖家的 AI 运营平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-gray-100 antialiased">{children}</body>
    </html>
  );
}
