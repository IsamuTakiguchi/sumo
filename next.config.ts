import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 音声生成はすべてブラウザ内で完結するため、特別な設定は不要。
  // 将来 lib/providers/remote.ts を実装して外部 AI 音楽 API を使う場合は
  // app/api/generate/route.ts を追加する（そのためサーバーは残しておく）。
  reactStrictMode: true,
};

export default nextConfig;
