/**
 * PWA の定義。「ホーム画面に追加」でアプリとして起動できるようにする。
 *
 * icons の src には basePath を前置すること。GitHub Pages では `/sumo/` 配下に
 * 出るので、`/icon-192.png` のままだと 404 になり、インストールできない。
 */

import type { MetadataRoute } from 'next';
import { basePath } from '@/lib/basePath';

// 中身はビルド時に確定する。これを宣言しないと output: 'export' のビルドが
// 「静的にできない」と言って落ちる（GitHub Pages 向けの書き出しが通らなくなる）
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'sumo — AI 音楽ジェネレーター',
    short_name: 'sumo',
    description: 'プロンプトから楽曲を生成する AI 音楽スタジオ。',
    lang: 'ja',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#07070c',
    theme_color: '#07070c',
    icons: [
      {
        src: `${basePath}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // 端を丸く切られても図が欠けないよう、余白を多めに取った版
        src: `${basePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
