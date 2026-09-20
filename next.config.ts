import type { NextConfig } from 'next';

/**
 * 静的書き出し（GitHub Pages など）は環境変数で切り替える。
 *
 * 常時 export にはしない。将来 app/api/generate/route.ts（外部 AI 音楽 API 用）を
 * 足したときに、設定を戻さず通常のサーバービルドへ切り替えられるようにするため。
 *
 *   NEXT_OUTPUT=export     静的書き出しを有効にする
 *   NEXT_BASE_PATH=/sumo   サブパス配下で公開する場合のプレフィックス
 */
const isExport = process.env.NEXT_OUTPUT === 'export';
const basePath = process.env.NEXT_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  ...(isExport ? { output: 'export' as const } : {}),

  // 未設定ならルート配信。ローカル開発は従来どおり http://localhost:3000/ で動く
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),

  // 素の fetch には basePath が付かないので、クライアントからも読めるようにしておく
  env: { NEXT_PUBLIC_BASE_PATH: basePath },

  // 静的ホスティングでディレクトリから index.html を引けるようにする
  trailingSlash: true,

  // 画像は使っていないが、export 時に最適化が有効だとビルドが止まるため無効化しておく
  images: { unoptimized: true },
};

export default nextConfig;
