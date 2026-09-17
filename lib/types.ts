/**
 * アプリ全体で共有する型定義。
 *
 * 生成パイプラインは
 *   GenerationRequest → ResolvedSpec → Arrangement → StereoBuffer → Track
 * という一方向の流れになっている。Arrangement までは音に触らない純粋なデータで、
 * StereoBuffer 以降が実際の波形。合成は素の JavaScript で行う（lib/audio 以下）。
 */

/** 0 = C, 1 = C#, ... 11 = B */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type ScaleId =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'mixolydian'
  | 'lydian'
  | 'phrygian'
  | 'harmonicMinor'
  | 'majorPentatonic'
  | 'minorPentatonic';

export type GenreId =
  | 'lofi'
  | 'citypop'
  | 'edm'
  | 'rock'
  | 'ambient'
  | 'jazz'
  | 'trap'
  | 'cinematic';

export type MoodId =
  | 'happy'
  | 'sad'
  | 'chill'
  | 'energetic'
  | 'dreamy'
  | 'dark'
  | 'epic'
  | 'romantic'
  | 'nostalgic';

export type VoiceId =
  // ドラム
  | 'kick'
  | 'snare'
  | 'clap'
  | 'hatClosed'
  | 'hatOpen'
  | 'tom'
  | 'ride'
  // ベース
  | 'bass'
  | 'sub808'
  // 和音・装飾
  | 'epiano'
  | 'piano'
  | 'pad'
  | 'strings'
  | 'pluck'
  | 'lead'
  | 'guitar'
  | 'bell'
  | 'vinyl';

export type PartRole = 'drums' | 'bass' | 'harmony' | 'arp' | 'lead' | 'texture';

export type SectionKind =
  | 'intro'
  | 'verse'
  | 'prechorus'
  | 'chorus'
  | 'bridge'
  | 'break'
  | 'outro';

/** ユーザーが UI で指定する内容 */
export interface GenerationRequest {
  prompt: string;
  genre: GenreId;
  moods: MoodId[];
  /** 「必ず入れたい楽器」のヒント */
  instruments: VoiceId[];
  /** null なら ジャンル既定 + シードから決定 */
  tempo: number | null;
  durationSec: number;
  /** null なら おまかせ */
  key: { root: PitchClass; scale: ScaleId } | null;
  vocal: 'instrumental' | 'lyrics';
  lyrics: string | null;
  /** null なら プロンプトと現在時刻から自動生成 */
  seed: number | null;
  providerId: string;
}

/**
 * シードとジャンル既定をすべて解決した後の確定パラメータ。
 * これが同じなら必ず同じ Arrangement になる（＝決定性の単位）。
 */
export interface ResolvedSpec {
  seed: number;
  genre: GenreId;
  tempo: number;
  /** 0 = ストレート, 0.5 以上でハネる */
  swing: number;
  key: { root: PitchClass; scale: ScaleId };
  bars: number;
  /** 0..1 全体の熱量。テンポ・音数・音色の明るさに影響 */
  energy: number;
  /** 0..1 フィルタの開き具合とオクターブ */
  brightness: number;
  /** 0..1 音符の詰まり具合 */
  density: number;
  vocal: 'instrumental' | 'lyrics';
  moods: MoodId[];
}

export interface NoteEvent {
  /** 曲頭からの秒数 */
  time: number;
  /** 秒 */
  dur: number;
  /** Hz。ドラムは代表周波数（音程を持たないものは 0 でもよい） */
  freq: number;
  /** 0..1 */
  vel: number;
  voice: VoiceId;
  role: PartRole;
  /** -1..1。省略時はパート既定 */
  pan?: number;
  /** 808 のスライドなど、この周波数から滑り込む */
  glideFrom?: number;
}

export interface ChordSlot {
  /** 曲頭からの小節番号 */
  bar: number;
  /** 小節内の拍位置 */
  beat: number;
  /** 長さ（拍） */
  beats: number;
  /** 'vi' 'IVM7' 'V7' などのローマ数字表記 */
  roman: string;
  /** ルート音の MIDI ノート番号 */
  root: number;
  /** 構成音の MIDI ノート番号（ボイスリーディング済み） */
  pitches: number[];
  startSec: number;
  durSec: number;
}

export interface Section {
  kind: SectionKind;
  labelJa: string;
  startBar: number;
  bars: number;
  startSec: number;
  durSec: number;
  /** 0..1 */
  energy: number;
  activeRoles: PartRole[];
  chords: ChordSlot[];
}

/**
 * ミキサーの 1 チャンネル分の設定。
 * NoteEvent の `${role}:${voice}` がそのままキーになる。
 */
export interface BusSpec {
  key: string;
  role: PartRole;
  voice: VoiceId;
  gain: number;
  pan: number;
  reverbSend: number;
  delaySend: number;
  /** 0 より大きければ、このチャンネルにサチュレーションを掛ける */
  drive?: number;
  /** 0 より大きければ、このチャンネルにコーラスを掛ける */
  chorus?: number;
}

export interface Arrangement {
  spec: ResolvedSpec;
  sections: Section[];
  /** 全パートをフラット化し、時刻順に並べたもの */
  events: NoteEvent[];
  buses: BusSpec[];
  totalSec: number;
  title: string;
}

export function busKeyOf(ev: Pick<NoteEvent, 'role' | 'voice'>): string {
  return `${ev.role}:${ev.voice}`;
}

/** セクション情報のうち UI 表示と永続化に必要な部分だけ */
export interface SectionSummary {
  kind: SectionKind;
  labelJa: string;
  startSec: number;
  durSec: number;
}

/** localStorage に保存されるトラック情報（音声は含まない） */
export interface TrackMeta {
  id: string;
  title: string;
  createdAt: number;
  request: GenerationRequest;
  spec: ResolvedSpec;
  durationSec: number;
  sections: SectionSummary[];
  lyrics: string | null;
  providerId: string;
}

/** 実行時のトラック。音声を保持するので永続化はされない */
export interface Track extends TrackMeta {
  /** WAV に変換済みの Blob。<audio> と ダウンロードの両方で使う */
  blob: Blob;
  /** blob の Object URL */
  url: string;
  /** 波形表示用に間引いた振幅（0..1） */
  peaks: Float32Array;
  /** ローカル生成なら編曲データを持つ。リモートプロバイダでは null */
  arrangement: Arrangement | null;
}

export type GenerationStage =
  | 'analyzing'
  | 'composing'
  | 'rendering'
  | 'encoding'
  | 'done';

export interface GenerationProgress {
  stage: GenerationStage;
  /** 0..1 */
  ratio: number;
  messageJa: string;
}
