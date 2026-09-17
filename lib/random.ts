/**
 * 決定論的な擬似乱数。
 *
 * 生成パイプライン全体でここ以外の乱数（Math.random）を使わないことで、
 * 「同じシード + 同じパラメータ = 同じ曲」を保証する。
 * この性質のおかげで、ライブラリには生成パラメータだけ保存しておけば
 * 再生時に同じ曲を作り直せる（音声データを保存する必要がない）。
 */

export type Rng = () => number;

/** mulberry32。状態 32bit の軽量な PRNG で、質と速度のバランスが良い */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32bit。文字列からシードを作る */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * パートごとに独立した乱数ストリームを切る。
 *
 * こうしておくと、たとえばドラム生成のロジックを変えてもメロディは変わらない。
 * 開発中の差分確認が楽になるうえ、将来「メロディだけ引き直す」機能も作れる。
 */
export function forkRng(seed: number, label: string): Rng {
  return mulberry32((seed ^ hashString(label)) >>> 0);
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: Rng, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error('pick: 空の配列から選択できません');
  return xs[Math.floor(rng() * xs.length)];
}

/** [値, 重み] の配列から重み付き抽選 */
export function weighted<T>(rng: Rng, xs: readonly (readonly [T, number])[]): T {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) throw new Error('weighted: 重みの合計が 0 です');
  let r = rng() * total;
  for (const [value, w] of xs) {
    r -= w;
    if (r <= 0) return value;
  }
  return xs[xs.length - 1][0];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** -amount .. +amount の揺らぎ。ヒューマナイズに使う */
export function jitter(rng: Rng, amount: number): number {
  return (rng() * 2 - 1) * amount;
}

/** Fisher-Yates。元の配列は変更しない */
export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** シードを 8 桁の 16 進数で表示する（UI 用） */
export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/** UI の入力欄からシードを読む。16 進・10 進・任意文字列のいずれも受け付ける */
export function parseSeed(input: string): number | null {
  const s = input.trim().replace(/^#/, '');
  if (s === '') return null;
  if (/^[0-9a-fA-F]{1,8}$/.test(s) && /[a-fA-F]/.test(s)) {
    return parseInt(s, 16) >>> 0;
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n >>> 0;
  }
  return hashString(s);
}
