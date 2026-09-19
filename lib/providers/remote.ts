/**
 * 外部 AI 音楽 API を使うプロバイダの雛形（未実装）。
 *
 * 実装する場合の流れ:
 *   1. app/api/generate/route.ts を追加し、サーバー側で Replicate / Suno などを叩く
 *      （API キーはサーバーの環境変数に置き、クライアントへは絶対に渡さない）
 *   2. ここから POST /api/generate → 返ってきた音声 URL を fetch
 *   3. arrayBuffer → AudioContext.decodeAudioData でデコード
 *   4. computePeaks / encodeWavBlob を通して Track を組み立てる
 *
 * Track.arrangement は null のままでよい（リモート生成では楽譜データが無いため、
 * 波形とセクション帯は peaks だけで描画される）。
 */

import type { Track } from '@/lib/types';
import type { MusicProvider } from './types';

export const REMOTE_PROVIDER_ID = 'remote-api';

export interface RemoteProviderConfig {
  endpoint: string;
  model: string;
}

export function createRemoteProvider(config: RemoteProviderConfig): MusicProvider {
  return {
    id: REMOTE_PROVIDER_ID,
    labelJa: '外部 AI 音楽 API',
    descJa: `未設定です（${config.model}）。app/api/generate を実装すると使えるようになります。`,
    supportsSeed: false,
    supportsLyrics: true,
    maxDurationSec: 120,

    isAvailable() {
      return process.env.NEXT_PUBLIC_REMOTE_PROVIDER_ENABLED === '1';
    },

    // 引数（GenerationRequest, GenerateOptions）は実装時に受け取る
    async generate(): Promise<Track> {
      throw new Error('リモートプロバイダは未設定です。内蔵シンセをお使いください。');
    },
  };
}
