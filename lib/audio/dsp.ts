/**
 * 素の JavaScript で書いた DSP プリミティブ。
 *
 * もともとは Web Audio のノードを音符ごとに組み立てていたが、
 * 1 曲で 1 万個近いノードができるため、実際の信号処理よりも
 * ノードの生成とグラフ走査のオーバーヘッドがレンダリング時間の大半を占めていた
 * （60 秒の曲で 50〜80 秒）。
 *
 * サンプル単位の計算を自前で回すと、その固定費がまるごと消えるうえ、
 * ブラウザ実装の差による音の揺れもなくなり、Node でもそのまま動く。
 */

export const TWO_PI = Math.PI * 2;

export interface StereoBuffer {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  length: number;
}

export function createStereo(length: number, sampleRate: number): StereoBuffer {
  return {
    left: new Float32Array(length),
    right: new Float32Array(length),
    sampleRate,
    length,
  };
}

// ---------------------------------------------------------------- 波形

/**
 * polyBLEP。鋸波・矩形波の不連続点を 1 サンプル幅で補正し、
 * 高音でのエイリアスノイズ（ジャリジャリした付帯音）を抑える。
 */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** phase, dt はいずれも 0..1（dt = 周波数 / サンプリングレート） */
export function saw(phase: number, dt: number): number {
  return 2 * phase - 1 - polyBlep(phase, dt);
}

export function square(phase: number, dt: number): number {
  let v = phase < 0.5 ? 1 : -1;
  v += polyBlep(phase, dt);
  v -= polyBlep(phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5, dt);
  return v;
}

/** 三角波は倍音が少なくエイリアスしにくいので素朴な式でよい */
export function triangle(phase: number): number {
  return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
}

export function sine(phase: number): number {
  return Math.sin(TWO_PI * phase);
}

export function wrap(phase: number): number {
  return phase >= 1 ? phase - Math.floor(phase) : phase;
}

// ---------------------------------------------------------------- エンベロープ

/** そのサンプル数で -60dB まで落ちる 1 サンプルあたりの減衰係数 */
export function decayCoef(seconds: number, sampleRate: number): number {
  return Math.exp(-6.907755 / Math.max(1, seconds * sampleRate));
}

export interface AdsrSpec {
  attack: number;
  decay: number;
  /** 0..1 */
  sustain: number;
  release: number;
}

/**
 * ADSR を 1 サンプルずつ返す。
 * 指数減衰は毎回 exp() を呼ばず、係数の掛け算で進める（速い）。
 */
export class Adsr {
  private value = 0;
  private i = 0;
  private readonly attackSamples: number;
  private readonly decayEnd: number;
  private readonly releaseStart: number;
  private readonly decayK: number;
  private readonly releaseK: number;
  private readonly peak: number;
  private readonly sustainLevel: number;
  private releaseValue = 0;

  constructor(spec: AdsrSpec, peak: number, holdSec: number, sampleRate: number) {
    this.peak = peak;
    this.sustainLevel = peak * spec.sustain;
    this.attackSamples = Math.max(1, Math.floor(spec.attack * sampleRate));
    this.decayEnd = this.attackSamples + Math.max(1, Math.floor(spec.decay * sampleRate));
    this.releaseStart = Math.max(this.decayEnd, Math.floor(holdSec * sampleRate));
    this.decayK = decayCoef(Math.max(0.001, spec.decay), sampleRate);
    this.releaseK = decayCoef(Math.max(0.001, spec.release), sampleRate);
  }

  /** 音がほぼ消えるまでのサンプル数 */
  static totalSamples(spec: AdsrSpec, holdSec: number, sampleRate: number): number {
    const attack = Math.max(1, Math.floor(spec.attack * sampleRate));
    const decay = Math.max(1, Math.floor(spec.decay * sampleRate));
    const releaseStart = Math.max(attack + decay, Math.floor(holdSec * sampleRate));
    return releaseStart + Math.floor(spec.release * sampleRate) + 8;
  }

  next(): number {
    const i = this.i++;
    if (i < this.attackSamples) {
      this.value = (this.peak * i) / this.attackSamples;
    } else if (i < this.releaseStart) {
      // ディケイ：サステインレベルへ向かって指数的に落ちる
      this.value = this.sustainLevel + (this.value - this.sustainLevel) * this.decayK;
      this.releaseValue = this.value;
    } else {
      this.releaseValue *= this.releaseK;
      this.value = this.releaseValue;
    }
    return this.value;
  }
}

/** 打楽器向け：短いアタックのあと指数減衰するだけ */
export class Perc {
  private value = 0;
  private i = 0;
  private readonly attackSamples: number;
  private readonly k: number;
  private readonly peak: number;

  constructor(peak: number, attack: number, decay: number, sampleRate: number) {
    this.peak = peak;
    this.attackSamples = Math.max(1, Math.floor(attack * sampleRate));
    this.k = decayCoef(decay, sampleRate);
  }

  static totalSamples(attack: number, decay: number, sampleRate: number): number {
    return Math.ceil((attack + decay) * sampleRate) + 8;
  }

  next(): number {
    const i = this.i++;
    if (i < this.attackSamples) {
      this.value = (this.peak * i) / this.attackSamples;
    } else {
      this.value *= this.k;
    }
    return this.value;
  }
}

// ---------------------------------------------------------------- フィルタ

/**
 * ZDF（トポロジー保存型）ステートバリアブルフィルタ。
 * ナイキスト近くまで安定していて、カットオフを動かしても破綻しない。
 * Andy Simper の定式化。
 */
export class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 0;

  lp = 0;
  bp = 0;
  hp = 0;

  constructor(
    private readonly sampleRate: number,
    cutoff = 1000,
    q = 0.7071,
  ) {
    this.set(cutoff, q);
  }

  set(cutoff: number, q: number): void {
    const fc = Math.max(20, Math.min(this.sampleRate * 0.49, cutoff));
    const g = Math.tan((Math.PI * fc) / this.sampleRate);
    this.k = 1 / Math.max(0.05, q);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  process(x: number): void {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
  }
}

/** 1 次ローパス（リバーブのダンピングなど、軽さ優先の場所で使う） */
export class OnePole {
  private y = 0;
  private a: number;

  constructor(cutoff: number, sampleRate: number) {
    this.a = 1 - Math.exp((-TWO_PI * cutoff) / sampleRate);
  }

  process(x: number): number {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

/** DC 除去つきハイパス */
export class OnePoleHigh {
  private y = 0;
  private prev = 0;
  private readonly r: number;

  constructor(cutoff: number, sampleRate: number) {
    this.r = Math.exp((-TWO_PI * cutoff) / sampleRate);
  }

  process(x: number): number {
    this.y = this.r * this.y + x - this.prev;
    this.prev = x;
    return this.y;
  }
}

// ---------------------------------------------------------------- その他

/** tanh 系のソフトクリップ。amount が大きいほど歪む */
export function softClip(x: number, k: number): number {
  return Math.tanh(k * x);
}

/** 等電力パンニング。pan は -1（左）〜 +1（右） */
export function panGains(pan: number): [number, number] {
  const p = (Math.max(-1, Math.min(1, pan)) + 1) * 0.25 * Math.PI;
  return [Math.cos(p), Math.sin(p)];
}

/** mono のバッファを、パンを掛けながらステレオへ加算する */
export function addToStereo(
  dst: StereoBuffer,
  src: Float32Array,
  count: number,
  offset: number,
  gain: number,
  pan: number,
): void {
  const [gl, gr] = panGains(pan);
  const l = dst.left;
  const r = dst.right;
  const start = Math.max(0, offset);
  const skip = start - offset;
  const n = Math.min(count - skip, dst.length - start);
  for (let i = 0; i < n; i++) {
    const v = src[i + skip] * gain;
    l[start + i] += v * gl;
    r[start + i] += v * gr;
  }
}
