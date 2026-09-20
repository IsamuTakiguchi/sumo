/**
 * ミックス用のエフェクト。すべて Float32Array 上で直接処理する。
 */

import { OnePole, OnePoleHigh, softClip, type StereoBuffer } from './dsp';

/** Freeverb 由来のコムフィルタ長（44.1kHz でのサンプル数） */
const COMB_SAMPLES = [1116, 1188, 1277, 1356, 1422, 1491];
/** ディフュージョン用のオールパス長 */
const ALLPASS_SAMPLES = [556, 441, 341, 225];
/** 左右でわずかにずらしてステレオ感を出す */
const STEREO_SPREAD = 23;

class Comb {
  private readonly buffer: Float32Array;
  private index = 0;
  private store = 0;

  constructor(
    size: number,
    private readonly feedback: number,
    private readonly damp: number,
  ) {
    this.buffer = new Float32Array(Math.max(1, size));
  }

  process(input: number): number {
    const output = this.buffer[this.index];
    this.store = output * (1 - this.damp) + this.store * this.damp;
    this.buffer[this.index] = input + this.store * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }
}

class Allpass {
  private readonly buffer: Float32Array;
  private index = 0;

  constructor(
    size: number,
    private readonly feedback: number,
  ) {
    this.buffer = new Float32Array(Math.max(1, size));
  }

  process(input: number): number {
    const stored = this.buffer[this.index];
    this.buffer[this.index] = input + stored * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;
    return stored - input;
  }
}

/**
 * Schroeder / Freeverb 型のリバーブ。モノラルのセンドを受けてステレオで返す。
 *
 * 畳み込み（インパルス応答）の方が響きは自然だが、2 秒の IR でも
 * レンダリング時間の大半を食ってしまうため、遅延回路を組む昔ながらの方式を採る。
 *
 * @param rt60 残響がおよそ -60dB まで落ちるまでの秒数
 * @param damping 大きいほど高域が早く減衰する
 */
export function applyReverb(
  send: Float32Array,
  out: StereoBuffer,
  rt60: number,
  damping: number,
  mix: number,
): void {
  const sr = out.sampleRate;
  const scale = sr / 44100;
  const damp = Math.max(0.05, Math.min(0.92, 1 - 1 / Math.max(1.05, damping * 1.6)));
  const preDelay = Math.floor(0.022 * sr);

  const channels = [0, 1].map((ch) => {
    const combs = COMB_SAMPLES.map((s) => {
      const size = Math.round((s + ch * STEREO_SPREAD) * scale);
      const time = size / sr;
      const feedback = Math.min(0.93, Math.pow(10, (-3 * time) / Math.max(0.2, rt60)));
      return new Comb(size, feedback, damp);
    });
    const allpasses = ALLPASS_SAMPLES.map(
      (s) => new Allpass(Math.round((s + ch * STEREO_SPREAD) * scale), 0.5),
    );
    return { combs, allpasses };
  });

  const combScale = mix / COMB_SAMPLES.length;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i >= preDelay ? send[i - preDelay] : 0;
    for (let ch = 0; ch < 2; ch++) {
      const { combs, allpasses } = channels[ch];
      let v = 0;
      for (let k = 0; k < combs.length; k++) v += combs[k].process(x);
      v *= combScale;
      for (let k = 0; k < allpasses.length; k++) v = allpasses[k].process(v);
      if (ch === 0) out.left[i] += v;
      else out.right[i] += v;
    }
  }
}

/** フィードバック付きのピンポンディレイ */
export function applyDelay(
  send: Float32Array,
  out: StereoBuffer,
  delaySec: number,
  feedback: number,
  mix: number,
): void {
  const sr = out.sampleRate;
  const size = Math.max(1, Math.round(delaySec * sr));
  const bufL = new Float32Array(size);
  const bufR = new Float32Array(size);
  const toneL = new OnePole(3000, sr);
  const toneR = new OnePole(3000, sr);
  const hpL = new OnePoleHigh(400, sr);
  const hpR = new OnePoleHigh(400, sr);
  let index = 0;

  const n = out.length;
  for (let i = 0; i < n; i++) {
    const outL = bufL[index];
    const outR = bufR[index];
    // 左右を入れ替えて返すことで、音が左右に跳ねる
    bufL[index] = send[i] + hpR.process(toneR.process(outR)) * feedback;
    bufR[index] = hpL.process(toneL.process(outL)) * feedback;
    index = (index + 1) % size;
    out.left[i] += outL * mix;
    out.right[i] += outR * mix;
  }
}

/** モジュレートしたディレイ 2 本によるコーラス。厚みを出す */
export function applyChorus(buf: StereoBuffer, depth: number): void {
  const sr = buf.sampleRate;
  const maxDelay = Math.ceil(0.04 * sr);
  const size = maxDelay + 4;
  const lines: { buffer: Float32Array; base: number; inc: number; phase: number }[] = [
    { buffer: new Float32Array(size), base: 0.012 * sr, inc: 0.21 / sr, phase: 0 },
    { buffer: new Float32Array(size), base: 0.018 * sr, inc: 0.33 / sr, phase: 0.5 },
  ];
  const wet = 0.4 * depth;
  const mod = 0.004 * sr * depth;
  let index = 0;

  for (let i = 0; i < buf.length; i++) {
    const dry = (buf.left[i] + buf.right[i]) * 0.5;
    let wetL = 0;
    let wetR = 0;
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k];
      line.buffer[index] = dry;
      line.phase += line.inc;
      const offset = line.base + Math.sin(2 * Math.PI * line.phase) * mod;
      // 小数サンプルぶんは線形補間して、なめらかに揺らす
      const read = index - offset;
      const r0 = Math.floor(read);
      const frac = read - r0;
      const a = line.buffer[((r0 % size) + size) % size];
      const b = line.buffer[((r0 + 1) % size + size) % size];
      const v = a + (b - a) * frac;
      if (k === 0) wetL = v;
      else wetR = v;
    }
    index = (index + 1) % size;
    buf.left[i] += wetL * wet;
    buf.right[i] += wetR * wet;
  }
}

/**
 * ソフトクリップによる飽和。音に密度と暖かさを足す。
 *
 * 小信号でのゲインは 1 に保つ（`tanh(k·x)/k` の傾きは原点で 1）。
 * 以前は `tanh(k·x)/tanh(k)` で正規化していたが、これは小信号を k/tanh(k) 倍
 * ＝ amount 0.25 で 2.5 倍も持ち上げる「隠れたゲイン段」になっていた。
 * ベースのチャンネルにだけ掛かっていたため、ミックスを数値で組み立てられなくなっていた。
 * ここが音量を変えないので、音量はすべてバスのゲインで決まる。
 */
export function applyDrive(buf: StereoBuffer, amount: number): void {
  const k = 1 + amount * 6;
  const comp = 1 / k;
  for (let i = 0; i < buf.length; i++) {
    buf.left[i] = softClip(buf.left[i], k) * comp;
    buf.right[i] = softClip(buf.right[i], k) * comp;
  }
}

export function applyOnePoleLowpass(buf: StereoBuffer, cutoff: number): void {
  const l = new OnePole(cutoff, buf.sampleRate);
  const r = new OnePole(cutoff, buf.sampleRate);
  for (let i = 0; i < buf.length; i++) {
    buf.left[i] = l.process(buf.left[i]);
    buf.right[i] = r.process(buf.right[i]);
  }
}

export function applyOnePoleHighpass(buf: StereoBuffer, cutoff: number): void {
  const l = new OnePoleHigh(cutoff, buf.sampleRate);
  const r = new OnePoleHigh(cutoff, buf.sampleRate);
  for (let i = 0; i < buf.length; i++) {
    buf.left[i] = l.process(buf.left[i]);
    buf.right[i] = r.process(buf.right[i]);
  }
}

/**
 * 素朴なピーク検出型コンプレッサー。
 * 曲ごとの音量差を均し、全体の密度を上げる。
 *
 * `detectorHighpass` を指定すると、検出側だけにハイパスを掛ける（サイドチェイン HPF）。
 * これが無いと検出器はキックとベースのピークしか見ず、低音が鳴るたびに曲全体が沈んで
 * 旋律が周期的に埋もれる。掛かる音は素通しで、何を「大きい」と見なすかだけが変わる。
 */
export function applyCompressor(
  buf: StereoBuffer,
  threshold: number,
  ratio: number,
  attackSec: number,
  releaseSec: number,
  detectorHighpass = 0,
): void {
  const sr = buf.sampleRate;
  const attack = Math.exp(-1 / Math.max(1, attackSec * sr));
  const release = Math.exp(-1 / Math.max(1, releaseSec * sr));
  const hpL = detectorHighpass > 0 ? new OnePoleHigh(detectorHighpass, sr) : null;
  const hpR = detectorHighpass > 0 ? new OnePoleHigh(detectorHighpass, sr) : null;
  let env = 0;

  for (let i = 0; i < buf.length; i++) {
    const dl = hpL ? hpL.process(buf.left[i]) : buf.left[i];
    const dr = hpR ? hpR.process(buf.right[i]) : buf.right[i];
    const level = Math.max(Math.abs(dl), Math.abs(dr));
    const coef = level > env ? attack : release;
    env = level + (env - level) * coef;

    let gain = 1;
    if (env > threshold) {
      gain = (threshold + (env - threshold) / ratio) / env;
    }
    buf.left[i] *= gain;
    buf.right[i] *= gain;
  }
}

export function applyGain(buf: StereoBuffer, gain: number): void {
  for (let i = 0; i < buf.length; i++) {
    buf.left[i] *= gain;
    buf.right[i] *= gain;
  }
}

/**
 * 平均音量（RMS）を目標値に合わせる。
 *
 * ピーク基準で揃えると、キックとベースが重なった一瞬のピークが曲全体の音量を決めてしまい、
 * ベースを下げない限り他のパートが大きくならない。体感音量に近い RMS で合わせることで、
 * 低音の一発に音量を独占されなくなる。はみ出したピークは後段のリミッタが受ける。
 */
export function normalizeLoudness(buf: StereoBuffer, targetRms: number, maxGain = 6): void {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf.left[i] * buf.left[i] + buf.right[i] * buf.right[i];
  }
  const rms = Math.sqrt(sum / Math.max(1, buf.length * 2));
  if (rms < 1e-5) return;
  applyGain(buf, Math.min(maxGain, targetRms / rms));
}

/**
 * ピークが上限を超えていたときだけ下げる（持ち上げはしない）。
 * `normalizeLoudness` で揃えた音量を壊さずに、クリップだけを防ぐための最終段。
 */
export function applyPeakCeiling(buf: StereoBuffer, ceiling: number): void {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const l = Math.abs(buf.left[i]);
    const r = Math.abs(buf.right[i]);
    if (l > peak) peak = l;
    if (r > peak) peak = r;
  }
  if (peak > ceiling) applyGain(buf, ceiling / peak);
}

