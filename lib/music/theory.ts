/**
 * 音楽理論のユーティリティ。
 * MIDI ノート番号（60 = 中央ハ）を基本単位として扱い、最後に周波数へ変換する。
 */

import type { PitchClass, ScaleId } from '@/lib/types';

export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export const SCALE_LABELS_JA: Record<ScaleId, string> = {
  major: 'メジャー',
  minor: 'マイナー',
  dorian: 'ドリアン',
  mixolydian: 'ミクソリディアン',
  lydian: 'リディアン',
  phrygian: 'フリジアン',
  harmonicMinor: 'ハーモニックマイナー',
  majorPentatonic: 'メジャーペンタトニック',
  minorPentatonic: 'マイナーペンタトニック',
};

/** ルートからの半音数 */
export const SCALE_STEPS: Record<ScaleId, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

/** マイナー系かどうか（暗さの判定に使う） */
export function isMinorish(scale: ScaleId): boolean {
  return SCALE_STEPS[scale].includes(3);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteName(root: PitchClass): string {
  return NOTE_NAMES[root];
}

export function keyLabelJa(root: PitchClass, scale: ScaleId): string {
  return `${NOTE_NAMES[root]} ${SCALE_LABELS_JA[scale]}`;
}

/**
 * スケール上の度数（0 起点、負数や 7 以上も可）から MIDI ノート番号を求める。
 * octave は 4 で中央付近。
 */
export function degreeToMidi(
  root: PitchClass,
  scale: ScaleId,
  degree: number,
  octave: number,
): number {
  const steps = SCALE_STEPS[scale];
  const n = steps.length;
  const octaveShift = Math.floor(degree / n);
  const index = ((degree % n) + n) % n;
  return root + steps[index] + 12 * (octave + 1 + octaveShift);
}

/** 指定オクターブ範囲のスケール構成音を昇順で返す */
export function scaleNotes(
  root: PitchClass,
  scale: ScaleId,
  octaveFrom: number,
  octaveTo: number,
): number[] {
  const out: number[] = [];
  const n = SCALE_STEPS[scale].length;
  for (let oct = octaveFrom; oct <= octaveTo; oct++) {
    for (let d = 0; d < n; d++) {
      out.push(degreeToMidi(root, scale, d, oct));
    }
  }
  return out.sort((a, b) => a - b);
}

/** 任意の MIDI ノートを、最も近いスケール構成音へ寄せる */
export function quantizeToScale(
  midi: number,
  root: PitchClass,
  scale: ScaleId,
): number {
  const steps = SCALE_STEPS[scale];
  const rel = ((Math.round(midi) - root) % 12 + 12) % 12;
  const base = Math.round(midi) - rel;
  let best = steps[0];
  let bestDist = Infinity;
  for (const s of steps) {
    const d = Math.min(Math.abs(s - rel), Math.abs(s + 12 - rel), Math.abs(s - 12 - rel));
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  const candidates = [base + best, base + best + 12, base + best - 12];
  return candidates.reduce((a, b) =>
    Math.abs(a - midi) <= Math.abs(b - midi) ? a : b,
  );
}

const ROMAN_TO_DEGREE: Record<string, number> = {
  i: 0,
  ii: 1,
  iii: 2,
  iv: 3,
  v: 4,
  vi: 5,
  vii: 6,
};

/** コードの種類ごとの、ルートからの半音数 */
const CHORD_INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7], // メジャー
  m: [0, 3, 7],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '9': [0, 4, 7, 10, 14],
  M9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  '13': [0, 4, 7, 10, 14, 21],
  '5': [0, 7], // パワーコード
};

export interface ParsedChord {
  rootMidi: number;
  /** ルートからの半音数（ルートの 0 を含む） */
  intervals: number[];
}

/**
 * ローマ数字表記のコードを解析する。
 *
 * 大文字ならメジャー系、小文字ならマイナー系。
 * 先頭に b / # を置くと借用和音（例: bVII）。
 * 後ろにサフィックスを付けられる（例: IVM7, V7, i9, IIIsus4）。
 *
 * 度数はスケールに沿って解釈するのではなく「メジャースケール上の度数 + 臨時記号」
 * として解釈する。こうしないと、マイナーキーで bVII と VII を書き分けられない。
 */
export function parseRoman(
  roman: string,
  root: PitchClass,
  octave: number,
): ParsedChord {
  const m = /^([b#]?)([ivIV]+)(.*)$/.exec(roman.trim());
  if (!m) throw new Error(`コード表記を解析できません: ${roman}`);
  const [, accidental, numeral, rawSuffix] = m;

  const degree = ROMAN_TO_DEGREE[numeral.toLowerCase()];
  if (degree === undefined) throw new Error(`度数を解析できません: ${roman}`);

  const isLower = numeral === numeral.toLowerCase();
  const accShift = accidental === 'b' ? -1 : accidental === '#' ? 1 : 0;

  // メジャースケールを基準に度数 → 半音数を決める
  const semitone = SCALE_STEPS.major[degree] + accShift;
  const rootMidi = root + semitone + 12 * (octave + 1);

  let suffix = rawSuffix;
  // 小文字のローマ数字は三和音をマイナーにする。M7 のような明示指定は尊重する。
  if (isLower && suffix === '') suffix = 'm';
  else if (isLower && (suffix === '7' || suffix === '9')) suffix = `m${suffix}`;
  else if (isLower && suffix === '6') suffix = 'm6';
  else if (isLower && suffix === 'add9') suffix = 'madd9';

  const intervals = CHORD_INTERVALS[suffix];
  if (!intervals) throw new Error(`未知のコード種別です: ${roman} (${suffix})`);

  return { rootMidi, intervals };
}

/**
 * 転回形を選んでボイスリーディングする。
 *
 * 直前のコードから各声部の移動距離が最小になる形を選ぶ。
 * これがあるだけでパッドやエレピの響きが一気に「音楽らしく」なる。
 */
export function voiceChord(
  rootMidi: number,
  intervals: number[],
  targetCenter: number,
  prev?: number[],
): number[] {
  // ルート以外の構成音を、中心音の周辺のオクターブへ畳み込む
  const pitchClasses = intervals.map((iv) => (rootMidi + iv) % 12);
  const voiced: number[] = [];

  for (const pc of pitchClasses) {
    // targetCenter に最も近い当該ピッチクラスの音を探す
    const base = Math.round(targetCenter / 12) * 12 + pc;
    const candidates = [base - 12, base, base + 12];
    let bestNote = candidates[0];
    let bestCost = Infinity;
    for (const c of candidates) {
      // 直前の和音に近い音を優先し、なければ中心音に近い音を選ぶ
      const ref = prev && prev.length > 0 ? nearest(c, prev) : targetCenter;
      const cost = Math.abs(c - ref) + Math.abs(c - targetCenter) * 0.35;
      if (cost < bestCost) {
        bestCost = cost;
        bestNote = c;
      }
    }
    voiced.push(bestNote);
  }

  // 重複を除いて昇順に
  return Array.from(new Set(voiced)).sort((a, b) => a - b);
}

function nearest(value: number, xs: number[]): number {
  let best = xs[0];
  for (const x of xs) {
    if (Math.abs(x - value) < Math.abs(best - value)) best = x;
  }
  return best;
}

/** 与えられた音を、コード構成音のうち最も近いものへ寄せる */
export function nearestChordTone(midi: number, chord: number[]): number {
  if (chord.length === 0) return midi;
  const pcs = new Set(chord.map((n) => ((n % 12) + 12) % 12));
  let best = midi;
  let bestDist = Infinity;
  for (let offset = -6; offset <= 6; offset++) {
    const cand = Math.round(midi) + offset;
    if (pcs.has(((cand % 12) + 12) % 12) && Math.abs(offset) < bestDist) {
      bestDist = Math.abs(offset);
      best = cand;
    }
  }
  return best;
}

/** コード構成音を 1 オクターブ内に並べ直す（アルペジオ用） */
export function chordTonesForArp(pitches: number[], octaves: number): number[] {
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const p of pitches) out.push(p + o * 12);
  }
  return out.sort((a, b) => a - b);
}
