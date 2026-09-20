/**
 * ブラウザと `app/api/music/route.ts` の間で取り交わす形。
 *
 * ElevenLabs のスキーマをそのままクライアントに晒さず、ここで一段挟んでいる。
 * サーバー側は受け取った値を検証・クランプしてから ElevenLabs に渡すので、
 * 「クライアントを改造して 10 分の曲を作らせる」といった課金事故を防げる。
 */

/** 合い言葉を載せるヘッダ名 */
export const PASSPHRASE_HEADER = 'x-sumo-pass';

/** サーバー側で強制する尺の範囲（秒）。課金の上限をクライアントに委ねない */
export const MIN_DURATION_SEC = 10;
export const MAX_DURATION_SEC = 120;

/** ElevenLabs の制約（composition_plan） */
export const MAX_LINES_PER_SECTION = 30;
export const MAX_CHARS_PER_LINE = 200;
export const MIN_SECTION_MS = 3000;
export const MAX_SECTION_MS = 120000;

export interface MusicApiSection {
  /** 'Intro' / 'Verse 1' / 'Chorus' など */
  name: string;
  /** そのセクションの雰囲気を表す英語のキーワード */
  styles: string[];
  durationSec: number;
  /** 歌わせる歌詞。空配列ならインスト */
  lines: string[];
}

export interface MusicApiRequest {
  /** 英語のスタイル記述。曲全体の指示（文章） */
  prompt: string;
  /** 曲全体のスタイルをキーワードに分解したもの。構成指定のときに使う */
  styles: string[];
  durationSec: number;
  instrumental: boolean;
  /** 避けたい要素（英語） */
  avoid?: string[];
  /** 歌詞つきで構成まで指定したいとき */
  sections?: MusicApiSection[];
}

export interface MusicApiError {
  /** 画面にそのまま出せる日本語 */
  messageJa: string;
  /** 合い言葉の入力し直しを促すかどうか */
  needsPassphrase?: boolean;
}
