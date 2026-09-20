/**
 * ElevenLabs Music を使うプロバイダ。
 *
 * 内蔵シンセがルールベースの合成なのに対し、こちらは学習済みモデルが音声そのものを
 * 生成する。生楽器の質感も歌声も出せるが、その代わりに
 *   - ネットワークとサーバー（API キーはブラウザに置けない）
 *   - 1 曲あたりの課金（$0.15/分）
 *   - 同じ指示でも毎回違う曲になる（作り直しでは元に戻らない）
 * という性質を持つ。最後の点が保存設計に効いてくるので、生成した音声は
 * IndexedDB に残す（lib/storage/audioCache.ts）。
 *
 * 鍵は `app/api/music/route.ts` だけが持つ。ここからは合い言葉しか送らない。
 */

import type {
  GenerationRequest,
  GenerationStage,
  MoodId,
  ScaleId,
  Track,
  VoiceId,
} from '@/lib/types';
import { GENRE_PRESETS } from '@/lib/music/genres';
import { analyzePrompt } from '@/lib/music/prompt';
import { generateTitle } from '@/lib/music/lyrics';
import { noteName } from '@/lib/music/theory';
import { mulberry32 } from '@/lib/random';
import { resolveSeed } from '@/lib/seed';
import { createTrackId } from './ids';
import { computePeaks } from '@/lib/audio/peaks';
import { decodeToStereo } from '@/lib/audio/decode';
import {
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  PASSPHRASE_HEADER,
  type MusicApiError,
  type MusicApiRequest,
  type MusicApiSection,
} from './musicApi';
import type { GenerateOptions, MusicProvider } from './types';

export const ELEVENLABS_ID = 'elevenlabs';

/** 合い言葉が違うときに投げる。UI 側で再入力を促すために型で見分ける */
export class PassphraseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PassphraseError';
  }
}

/** UI の日本語タグを、モデルに効く英語のスタイル語へ置き換える */
const MOOD_STYLE_EN: Record<MoodId, string> = {
  happy: 'upbeat and cheerful',
  sad: 'melancholic, bittersweet',
  chill: 'laid-back, relaxed',
  energetic: 'high energy, driving',
  dreamy: 'dreamy, ethereal',
  dark: 'dark, brooding',
  epic: 'epic, cinematic, powerful',
  romantic: 'warm, romantic',
  nostalgic: 'nostalgic, wistful',
};

const INSTRUMENT_STYLE_EN: Record<string, string> = {
  piano: 'acoustic piano',
  epiano: 'electric piano',
  guitar: 'electric guitar',
  strings: 'string section',
  pad: 'synth pad',
  lead: 'synth lead',
  pluck: 'plucked synth',
  bell: 'bells',
};

const SCALE_EN: Record<ScaleId, string> = {
  major: 'major',
  minor: 'minor',
  dorian: 'dorian',
  mixolydian: 'mixolydian',
  lydian: 'lydian',
  phrygian: 'phrygian',
  harmonicMinor: 'harmonic minor',
  majorPentatonic: 'major pentatonic',
  minorPentatonic: 'minor pentatonic',
};

/** 構成テンプレートの内部名を ElevenLabs に渡す英語のセクション名にする */
const SECTION_NAME_EN: Record<string, string> = {
  intro: 'Intro',
  verse: 'Verse',
  prechorus: 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  break: 'Break',
  outro: 'Outro',
};

/** 歌を乗せるセクション（ここに歌詞を配る） */
const SINGING_SECTIONS = new Set(['verse', 'prechorus', 'chorus', 'bridge']);

function instrumentWords(instruments: VoiceId[]): string[] {
  return instruments.map((i) => INSTRUMENT_STYLE_EN[i]).filter(Boolean);
}

/** リクエストから、曲全体のスタイルを表す英語キーワードを組み立てる */
function buildStyles(req: GenerationRequest): string[] {
  const preset = GENRE_PRESETS[req.genre];
  const hints = analyzePrompt(req.prompt);
  const styles = [preset.labelEn];

  for (const m of req.moods) {
    const w = MOOD_STYLE_EN[m];
    if (w) styles.push(w);
  }
  styles.push(...instrumentWords(req.instruments));

  const tempo = req.tempo ?? hints.explicitTempo;
  if (tempo) styles.push(`${tempo} BPM`);
  if (req.key) styles.push(`key of ${noteName(req.key.root)} ${SCALE_EN[req.key.scale]}`);

  styles.push('studio quality production');
  return styles;
}

/**
 * 曲の構成を組む。
 *
 * 内蔵シンセ側の planSections は ResolvedSpec と乱数器を要求するので、ここでは
 * ジャンルの構成テンプレートだけを借りて、尺は均等配分にする。
 * 細かい小節割りはモデル側が決めるため、こちらで詰める意味が薄い。
 */
function buildSections(req: GenerationRequest, lyrics: string): MusicApiSection[] {
  const preset = GENRE_PRESETS[req.genre];
  const kinds = preset.sectionTemplate.slice(0, 8);

  // 歌詞を空行で塊に割り、歌うセクションへ順番に配る
  const blocks = lyrics
    .split(/\n\s*\n/)
    .map((b) =>
      b
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((b) => b.length > 0);

  let next = 0;
  return kinds.map((kind, i) => {
    const sings = SINGING_SECTIONS.has(kind) && blocks.length > 0;
    const lines = sings ? (blocks[next++ % blocks.length] ?? []) : [];
    // イントロとアウトロは短く、サビは長めに
    const weight = kind === 'intro' || kind === 'outro' || kind === 'break' ? 1 : kind === 'chorus' ? 3 : 2;
    return {
      name: `${SECTION_NAME_EN[kind] ?? 'Section'} ${i + 1}`,
      styles: kind === 'chorus' ? ['full arrangement', 'big and wide'] : [],
      durationSec: weight,
      lines,
    };
  });
}

function buildPrompt(req: GenerationRequest, styles: string[]): string {
  const head = req.prompt.trim();
  const tail = styles.join(', ');
  // 日本語のプロンプトもそのまま添える。モデルは多言語を解釈できる
  return head ? `${head}. Style: ${tail}.` : `${tail}.`;
}

async function readError(res: Response): Promise<MusicApiError> {
  try {
    return (await res.json()) as MusicApiError;
  } catch {
    return { messageJa: `生成に失敗しました（${res.status}）。` };
  }
}

export interface ElevenLabsConfig {
  /** 生成を仲介するサーバーのパス。basePath 配下で公開する場合はそれを含める */
  endpoint: string;
  /** 合い言葉の取り出し方。UI 側の保存場所に依存させない */
  getPassphrase: () => string;
}

export function createElevenLabsProvider(config: ElevenLabsConfig): MusicProvider {
  return {
    id: ELEVENLABS_ID,
    labelJa: 'ElevenLabs Music（AI 生成）',
    descJa: '学習済みモデルが音声そのものを生成します。歌詞を入れると歌ってくれます。',
    supportsSeed: false,
    supportsLyrics: true,
    maxDurationSec: MAX_DURATION_SEC,

    isAvailable() {
      return (
        typeof window !== 'undefined' &&
        process.env.NEXT_PUBLIC_AI_PROVIDER_ENABLED === '1'
      );
    },

    async generate(req: GenerationRequest, opts: GenerateOptions = {}): Promise<Track> {
      const report = (stage: GenerationStage, ratio: number, messageJa: string) =>
        opts.onProgress?.({ stage, ratio, messageJa });

      report('analyzing', 0.05, '曲の指示を英語にまとめています…');

      const styles = buildStyles(req);
      const durationSec = Math.min(
        MAX_DURATION_SEC,
        Math.max(MIN_DURATION_SEC, req.durationSec),
      );
      const lyrics = req.vocal === 'lyrics' ? (req.lyrics ?? '').trim() : '';

      const payload: MusicApiRequest = {
        prompt: buildPrompt(req, styles),
        styles,
        durationSec,
        instrumental: lyrics.length === 0,
        avoid: ['low quality', 'distorted', 'muffled'],
        ...(lyrics ? { sections: buildSections(req, lyrics) } : {}),
      };

      report('composing', 0.12, 'ElevenLabs が作曲しています（30 秒〜数分かかります）…');

      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [PASSPHRASE_HEADER]: config.getPassphrase(),
        },
        body: JSON.stringify(payload),
        signal: opts.signal,
      });

      if (!res.ok) {
        const err = await readError(res);
        if (err.needsPassphrase) throw new PassphraseError(err.messageJa);
        throw new Error(err.messageJa);
      }

      report('rendering', 0.7, '音声を受け取っています…');
      const blob = await res.blob();

      report('encoding', 0.88, '波形を描いています…');
      const buffer = await decodeToStereo(blob);
      const peaks = computePeaks(buffer);
      const url = URL.createObjectURL(blob);

      const hints = analyzePrompt(req.prompt);
      const seed = resolveSeed(req);
      const title = generateTitle(hints, req.moods, mulberry32(seed), lyrics.length === 0);

      report('done', 1, '完成しました');

      return {
        id: createTrackId(),
        title,
        createdAt: Date.now(),
        // seed は記録するが、同じ曲は再現できない（supportsSeed: false）
        request: { ...req, seed, durationSec },
        // BPM もキーもモデルからは返らない。嘘の値を出さないよう null にする
        spec: null,
        // デコードできなかった環境では長さが取れない。指示した尺で代用する
        durationSec: buffer.length > 0 ? buffer.length / buffer.sampleRate : durationSec,
        sections: [],
        lyrics: lyrics || null,
        providerId: ELEVENLABS_ID,
        blob,
        url,
        peaks,
        arrangement: null,
      };
    },
  };
}
