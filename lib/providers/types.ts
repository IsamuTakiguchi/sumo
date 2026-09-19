import type { GenerationProgress, GenerationRequest, Track } from '@/lib/types';

export interface GenerateOptions {
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
}

/**
 * 音楽生成のバックエンド。
 *
 * 既定はブラウザ内蔵シンセ（localSynthProvider）。
 * 同じインターフェースで外部 AI 音楽 API（Replicate の MusicGen、Suno API など）を
 * 差し込めるようにしてある。lib/providers/remote.ts がその雛形。
 */
export interface MusicProvider {
  readonly id: string;
  readonly labelJa: string;
  readonly descJa: string;
  readonly supportsSeed: boolean;
  readonly supportsLyrics: boolean;
  readonly maxDurationSec: number;
  isAvailable(): boolean;
  generate(req: GenerationRequest, opts?: GenerateOptions): Promise<Track>;
}

export const STAGE_MESSAGES: Record<GenerationProgress['stage'], string> = {
  analyzing: 'プロンプトを解析しています…',
  composing: 'コード進行とメロディを組み立てています…',
  rendering: '音を合成しています…',
  encoding: '書き出しています…',
  done: '完成しました',
};
