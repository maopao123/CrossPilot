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
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('crosspilot-theme');
                  if (saved === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background text-gray-900 dark:text-gray-100 antialiased">{children}</body>
    </html>
  );
}
