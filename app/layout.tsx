import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * OGP の画像 URL は絶対パスでないと SNS 側が取得できない。
 * Next.js は metadataBase を基準に絶対化するので、公開先の URL を渡す。
 *
 * 公開先が 2 つある（GitHub Pages と Railway）ため、環境変数から取る。
 * 未設定のときは metadataBase を渡さない。相対 URL のまま中途半端な
 * og:image を出すより、出さないほうが害がない。
 *
 * 渡すのは**オリジンだけ**。サブパス（basePath）は Next が別途付けるので、
 * ここに含めると og:image が /sumo/sumo/... と二重になる。
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: 'sumo — AI 音楽ジェネレーター',
  description:
    'プロンプトとジャンルを選ぶだけで楽曲を生成します。内蔵シンセならオフラインで、ElevenLabs Music なら歌声つきで作れます。',
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  openGraph: {
    type: 'website',
    siteName: 'sumo',
    locale: 'ja_JP',
  },
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
