import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'sumo — AI 音楽ジェネレーター',
  description:
    'プロンプトとジャンルを選ぶだけで、ブラウザの中だけで楽曲を生成します。API キー不要・完全オフライン。',
};

export const viewport: Viewport = {
  themeColor: '#07070c',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
