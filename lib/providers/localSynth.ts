/**
 * 既定のプロバイダ。ブラウザ内蔵のシンセで楽曲を生成する。
 * ネットワークも API キーも不要で、完全にオフラインで動く。
 */

import type {
  GenerationRequest,
  GenerationStage,
  SectionSummary,
  Track,
} from '@/lib/types';
import { resolveSeed } from '@/lib/seed';
import { composeArrangement } from '@/lib/music/arrange';
import { bufferRms, renderArrangement } from '@/lib/audio/render';
import { computePeaks } from '@/lib/audio/peaks';
import { encodeWavBlob } from '@/lib/audio/wav';
import { STAGE_MESSAGES, type GenerateOptions, type MusicProvider } from './types';

export const LOCAL_SYNTH_ID = 'local-synth';

/** 無音に近い曲が出てしまったときに、シードをずらして作り直す回数 */
const MAX_RETRY = 1;
const SILENCE_RMS = 0.002;

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export const localSynthProvider: MusicProvider = {
  id: LOCAL_SYNTH_ID,
  labelJa: '内蔵シンセ（オフライン）',
  descJa: '音楽理論ルールと自前のシンセで、ブラウザの中だけで楽曲を合成します。',
  supportsSeed: true,
  supportsLyrics: true,
  maxDurationSec: 180,

  isAvailable() {
    // 合成はすべて素の JavaScript なので、Web Audio が無くても生成できる。
    // Blob の URL 化にだけブラウザが必要。
    return typeof window !== 'undefined' && typeof URL.createObjectURL === 'function';
  },

  async generate(req: GenerationRequest, opts: GenerateOptions = {}): Promise<Track> {
    const report = (stage: GenerationStage, ratio: number) =>
      opts.onProgress?.({ stage, ratio, messageJa: STAGE_MESSAGES[stage] });

    report('analyzing', 0.02);
    // 解析結果を UI に見せる余地を作るため、1 フレーム譲る
    await new Promise((r) => setTimeout(r, 0));

    let seed = resolveSeed(req);
    let composed = composeArrangement(req, seed);
    report('composing', 0.1);
    await new Promise((r) => setTimeout(r, 0));

    let buffer = await renderArrangement(composed.arrangement, {
      signal: opts.signal,
      onProgress: (r) => report('rendering', 0.12 + r * 0.78),
    });

    // 万一ほとんど無音になったら、シードをずらして一度だけ作り直す
    for (let i = 0; i < MAX_RETRY && bufferRms(buffer) < SILENCE_RMS; i++) {
      seed = (seed + 1) >>> 0;
      composed = composeArrangement(req, seed);
      buffer = await renderArrangement(composed.arrangement, {
        signal: opts.signal,
        onProgress: (r) => report('rendering', 0.12 + r * 0.78),
      });
    }

    report('encoding', 0.93);
    await new Promise((r) => setTimeout(r, 0));

    const peaks = computePeaks(buffer);
    const blob = encodeWavBlob(buffer);
    const url = URL.createObjectURL(blob);

    const { arrangement, lyricsText } = composed;
    const sections: SectionSummary[] = arrangement.sections.map((s) => ({
      kind: s.kind,
      labelJa: s.labelJa,
      startSec: s.startSec,
      durSec: s.durSec,
    }));

    report('done', 1);

    return {
      id: createId(),
      title: arrangement.title,
      createdAt: Date.now(),
      request: { ...req, seed },
      spec: arrangement.spec,
      durationSec: arrangement.totalSec,
      sections,
      lyrics: lyricsText,
      providerId: LOCAL_SYNTH_ID,
      blob,
      url,
      peaks,
      arrangement,
    };
  },
};
