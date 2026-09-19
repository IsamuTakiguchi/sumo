/**
 * シンセ音色の実装。
 *
 * サンプル音源は一切使わず、オシレーター・ノイズ・エンベロープ・フィルタだけで
 * 各楽器を組み立てる。すべての音色は
 *   (出力バッファ, NoteEvent, VoiceContext) => 書き込んだサンプル数
 * という同じ形をしていて、モノラルで書き出したものを呼び出し側がパンして混ぜる。
 *
 * 出力は必ず `out[i] = ...`（加算ではなく代入）で始めること。
 * 呼び出し側はバッファを消去せずに使い回している。
 */

import type { NoteEvent, ResolvedSpec, VoiceId } from '@/lib/types';
import type { Rng } from '@/lib/random';
import {
  Adsr,
  type AdsrSpec,
  OnePole,
  OnePoleHigh,
  Perc,
  Svf,
  decayCoef,
  saw,
  sine,
  square,
  triangle,
  wrap,
} from './dsp';

export interface VoiceContext {
  sampleRate: number;
  spec: ResolvedSpec;
  /** ノイズ生成用。ノートの順序が固定なので結果は再現可能 */
  rng: Rng;
}

export type VoiceRenderer = (
  out: Float32Array,
  ev: NoteEvent,
  vc: VoiceContext,
) => number;

/** セント単位のデチューンを周波数比に */
function cents(c: number): number {
  return Math.pow(2, c / 1200);
}

/** カットオフを動かすフィルタの係数更新間隔（毎サンプル tan() を呼ぶと重い） */
const COEF_INTERVAL = 16;

// ---------------------------------------------------------------- ドラム

const kick: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Perc.totalSamples(0.002, 0.45, sr));
  const env = new Perc(ev.vel, 0.002, 0.45, sr);
  const clickLen = Math.floor(0.005 * sr);
  const clickEnv = new Perc(ev.vel * 0.3, 0.0005, 0.012, sr);
  const hp = new OnePoleHigh(1200, sr);

  // 140Hz から 46Hz へ一気に落として「ドン」を作る
  const pitchK = Math.exp(-1 / (0.022 * sr));
  let pitch = 1;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const freq = 46 + 94 * pitch;
    pitch *= pitchK;
    phase = wrap(phase + freq / sr);
    let v = sine(phase) * env.next();
    if (i < clickLen) v += hp.process(vc.rng() * 2 - 1) * clickEnv.next();
    out[i] = v;
  }
  return n;
};

const snare: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Perc.totalSamples(0.001, 0.2, sr));
  const noiseEnv = new Perc(ev.vel * 0.75, 0.001, 0.17, sr);
  const bodyEnv = new Perc(ev.vel * 0.4, 0.001, 0.09, sr);
  const band = new Svf(sr, 1800, 0.9);
  const hp = new OnePoleHigh(260, sr);

  const pitchK = Math.exp(-1 / (0.03 * sr));
  let pitch = 1;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    band.process(vc.rng() * 2 - 1);
    const noise = hp.process(band.bp) * noiseEnv.next();
    const freq = 140 + 50 * pitch;
    pitch *= pitchK;
    phase = wrap(phase + freq / sr);
    out[i] = noise + triangle(phase) * bodyEnv.next();
  }
  return n;
};

const clap: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Perc.totalSamples(0.001, 0.2, sr));
  const band = new Svf(sr, 1200, 1.3);
  // 短いノイズを 4 連射して、手拍子の重なりを作る
  const bursts = [0, 0.009, 0.017, 0.024].map((off, i) => ({
    start: Math.floor(off * sr),
    env: new Perc(ev.vel * (i === 3 ? 0.7 : 0.45), 0.0005, i === 3 ? 0.13 : 0.012, sr),
  }));

  for (let i = 0; i < n; i++) {
    band.process(vc.rng() * 2 - 1);
    let amp = 0;
    for (const b of bursts) if (i >= b.start) amp += b.env.next();
    out[i] = band.bp * amp;
  }
  return n;
};

function hat(decay: number): VoiceRenderer {
  return (out, ev, vc) => {
    const sr = vc.sampleRate;
    const n = Math.min(out.length, Perc.totalSamples(0.001, decay, sr));
    const env = new Perc(ev.vel * 0.5, 0.001, decay, sr);
    const hp = new OnePoleHigh(7000, sr);
    const band = new Svf(sr, 10500, 1.4);

    for (let i = 0; i < n; i++) {
      band.process(hp.process(vc.rng() * 2 - 1));
      out[i] = band.bp * env.next();
    }
    return n;
  };
}

const tom: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Perc.totalSamples(0.002, 0.32, sr));
  const base = Math.max(60, ev.freq || 140);
  const env = new Perc(ev.vel * 0.85, 0.002, 0.32, sr);
  const noiseEnv = new Perc(ev.vel * 0.12, 0.001, 0.05, sr);
  const lp = new OnePole(2000, sr);
  const pitchK = Math.exp(-1 / (0.05 * sr));
  let pitch = 1;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const freq = base * (0.6 + 0.4 * pitch);
    pitch *= pitchK;
    phase = wrap(phase + freq / sr);
    out[i] = sine(phase) * env.next() + lp.process(vc.rng() * 2 - 1) * noiseEnv.next();
  }
  return n;
};

const ride: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Perc.totalSamples(0.002, 0.85, sr));
  const env = new Perc(ev.vel * 0.34, 0.002, 0.85, sr);
  const hp = new OnePoleHigh(5000, sr);
  const ratios = [1, 1.47, 2.13];
  const incs = ratios.map((r) => (3200 * r) / sr);
  const phases = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    let metal = 0;
    for (let k = 0; k < ratios.length; k++) {
      phases[k] = wrap(phases[k] + incs[k]);
      metal += square(phases[k], incs[k]) * 0.05;
    }
    out[i] = (hp.process(vc.rng() * 2 - 1) + metal) * env.next();
  }
  return n;
};

// ---------------------------------------------------------------- ベース

const BASS_ADSR: AdsrSpec = { attack: 0.006, decay: 0.14, sustain: 0.75, release: 0.09 };

const bass: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Adsr.totalSamples(BASS_ADSR, ev.dur, sr));
  const env = new Adsr(BASS_ADSR, ev.vel * 0.75, ev.dur, sr);
  const lp = new Svf(sr, 90, 3.5);

  // カットオフを一気に開いてから閉じることで、指で弾いたような立ち上がりになる
  const peakCut = 700 + vc.spec.brightness * 1400;
  const openSamples = Math.max(1, Math.floor(0.06 * sr));
  const closeK = Math.exp(-1 / (Math.max(0.05, ev.dur) * sr));
  let closing = 1;

  const inc = ev.freq / sr;
  const subInc = ev.freq / 2 / sr;
  let phase = 0;
  let subPhase = 0;

  for (let i = 0; i < n; i++) {
    if (i % COEF_INTERVAL === 0) {
      const open = i < openSamples ? i / openSamples : 1;
      if (i >= openSamples) closing *= Math.pow(closeK, COEF_INTERVAL);
      lp.set(90 + (peakCut - 90) * open * (0.4 + 0.6 * closing), 3.5);
    }
    phase = wrap(phase + inc);
    subPhase = wrap(subPhase + subInc);
    lp.process(saw(phase, inc) + sine(subPhase) * 0.55);
    out[i] = lp.lp * env.next();
  }
  return n;
};

const SUB_ADSR: AdsrSpec = { attack: 0.004, decay: 0.5, sustain: 0.6, release: 0.32 };

const sub808: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Adsr.totalSamples(SUB_ADSR, ev.dur, sr));
  const env = new Adsr(SUB_ADSR, ev.vel * 0.9, ev.dur, sr);

  // glideFrom があれば、その音程から滑り込む
  let freq = ev.glideFrom ?? ev.freq;
  const glide = 1 - Math.exp(-1 / (0.05 * sr));
  let phase = 0;

  for (let i = 0; i < n; i++) {
    freq += (ev.freq - freq) * glide;
    phase = wrap(phase + freq / sr);
    out[i] = sine(phase) * env.next();
  }
  return n;
};

// ---------------------------------------------------------------- 鍵盤・和音

const EPIANO_ADSR: AdsrSpec = { attack: 0.006, decay: 1.0, sustain: 0.28, release: 0.5 };

const epiano: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Adsr.totalSamples(EPIANO_ADSR, ev.dur, sr));
  const env = new Adsr(EPIANO_ADSR, ev.vel * 0.5, ev.dur, sr);
  const lp = new Svf(sr, 2200 + vc.spec.brightness * 2600, 0.7);

  // FM：高い周波数のモジュレーターでキャリアの周波数を揺らす。
  // 変調量を速く減衰させると、電気ピアノらしいアタックになる。
  const modInc = (ev.freq * 14) / sr;
  const bellInc = (ev.freq * 2) / sr;
  const modK = decayCoef(0.22, sr);
  let modIndex = ev.freq * 1.6;
  let modPhase = 0;
  let carrierPhase = 0;
  let bellPhase = 0;
  const bellEnv = new Perc(ev.vel * 0.12, 0.002, 0.09, sr);
  const tremInc = 4.5 / sr;
  let tremPhase = 0;

  for (let i = 0; i < n; i++) {
    modPhase = wrap(modPhase + modInc);
    const mod = sine(modPhase) * modIndex;
    modIndex *= modK;
    carrierPhase = wrap(carrierPhase + (ev.freq + mod) / sr);
    bellPhase = wrap(bellPhase + bellInc);
    tremPhase = wrap(tremPhase + tremInc);

    lp.process(sine(carrierPhase) + sine(bellPhase) * bellEnv.next());
    out[i] = lp.lp * env.next() * (0.88 + 0.12 * sine(tremPhase));
  }
  return n;
};

const piano: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  // 低い音ほど長く響かせる
  const midi = 69 + 12 * Math.log2(Math.max(20, ev.freq) / 440);
  const decay = 1.4 + Math.max(0, (72 - midi) / 12) * 0.5;
  const spec: AdsrSpec = { attack: 0.004, decay, sustain: 0.16, release: 0.4 };
  const n = Math.min(out.length, Adsr.totalSamples(spec, ev.dur, sr));
  const env = new Adsr(spec, ev.vel * 0.5, ev.dur, sr);
  const lp = new Svf(sr, 5200, 0.7);
  const cutK = Math.exp(-1 / (decay * sr));
  let cut = 1;

  const inc = ev.freq / sr;
  const inc2 = (ev.freq * 2) / sr;
  let p1 = 0;
  let p2 = 0;

  for (let i = 0; i < n; i++) {
    if (i % COEF_INTERVAL === 0) {
      cut *= Math.pow(cutK, COEF_INTERVAL);
      lp.set(1400 + 3800 * cut, 0.7);
    }
    p1 = wrap(p1 + inc);
    p2 = wrap(p2 + inc2);
    lp.process(triangle(p1) + saw(p1, inc) * 0.22 + sine(p2) * 0.12);
    out[i] = lp.lp * env.next();
  }
  return n;
};

const pad: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const attack = 0.35 + (1 - vc.spec.energy) * 0.5;
  const spec: AdsrSpec = { attack, decay: 0.6, sustain: 0.85, release: 1.6 };
  const n = Math.min(out.length, Adsr.totalSamples(spec, ev.dur, sr));
  const env = new Adsr(spec, ev.vel * 0.42, ev.dur, sr);
  const lp = new Svf(sr, 400, 1.2);

  const openTo = 1200 + vc.spec.brightness * 2600;
  const openSamples = Math.max(1, Math.floor((attack + 0.8) * sr));

  const incs = [-9, 0, 9].map((c) => (ev.freq * cents(c)) / sr);
  const phases = [0, 0, 0];
  const shimmerInc = (ev.freq * 2 * cents(4)) / sr;
  let shimmerPhase = 0;

  for (let i = 0; i < n; i++) {
    if (i % COEF_INTERVAL === 0) {
      lp.set(400 + (openTo - 400) * Math.min(1, i / openSamples), 1.2);
    }
    let v = 0;
    for (let k = 0; k < 3; k++) {
      phases[k] = wrap(phases[k] + incs[k]);
      v += saw(phases[k], incs[k]) * 0.33;
    }
    shimmerPhase = wrap(shimmerPhase + shimmerInc);
    v += triangle(shimmerPhase) * 0.14;
    lp.process(v);
    out[i] = lp.lp * env.next();
  }
  return n;
};

const STRINGS_ADSR: AdsrSpec = { attack: 0.22, decay: 0.4, sustain: 0.85, release: 0.8 };

const strings: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Adsr.totalSamples(STRINGS_ADSR, ev.dur, sr));
  const env = new Adsr(STRINGS_ADSR, ev.vel * 0.42, ev.dur, sr);
  const hp = new OnePoleHigh(150, sr);
  const lp = new Svf(sr, 2200 + vc.spec.brightness * 1800, 0.7);

  const detunes = [-14, -6, 6, 14];
  const phases = [0, 0, 0, 0];
  // ビブラートを少し遅れて効かせると、弓で弾いたような自然さが出る
  const vibInc = 5.4 / sr;
  let vibPhase = 0;
  const vibRamp = Math.max(1, Math.floor(0.35 * sr));

  for (let i = 0; i < n; i++) {
    vibPhase = wrap(vibPhase + vibInc);
    const vib = cents(sine(vibPhase) * Math.min(1, i / vibRamp) * 6);
    let v = 0;
    for (let k = 0; k < detunes.length; k++) {
      const inc = (ev.freq * cents(detunes[k]) * vib) / sr;
      phases[k] = wrap(phases[k] + inc);
      v += saw(phases[k], inc) * 0.25;
    }
    lp.process(hp.process(v));
    out[i] = lp.lp * env.next();
  }
  return n;
};

const pluck: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const decay = Math.min(0.5, Math.max(0.14, ev.dur * 0.8));
  const n = Math.min(out.length, Perc.totalSamples(0.003, decay, sr));
  const env = new Perc(ev.vel * 0.45, 0.003, decay, sr);
  const openCut = 2800 + vc.spec.brightness * 2400;
  const lp = new Svf(sr, 420 + openCut, 4);
  const cutK = Math.exp(-1 / (decay * 0.5 * sr));
  let cut = 1;

  const inc = ev.freq / sr;
  const inc2 = (ev.freq * cents(7)) / sr;
  let p1 = 0;
  let p2 = 0;

  for (let i = 0; i < n; i++) {
    if (i % COEF_INTERVAL === 0) {
      cut *= Math.pow(cutK, COEF_INTERVAL);
      lp.set(420 + openCut * cut, 4);
    }
    p1 = wrap(p1 + inc);
    p2 = wrap(p2 + inc2);
    lp.process(saw(p1, inc) + square(p2, inc2) * 0.3);
    out[i] = lp.lp * env.next();
  }
  return n;
};

const LEAD_ADSR: AdsrSpec = { attack: 0.012, decay: 0.2, sustain: 0.7, release: 0.24 };

const lead: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Adsr.totalSamples(LEAD_ADSR, ev.dur, sr));
  const env = new Adsr(LEAD_ADSR, ev.vel * 0.34, ev.dur, sr);
  const lp = new Svf(sr, 1200, 1.4);
  const openSamples = Math.max(1, Math.floor(0.12 * sr));
  const openTo = 3600 + vc.spec.brightness * 3600;

  // スーパーソウ（5 声のデチューン）
  const detunes = [-16, -7, 0, 7, 16];
  const phases = [0, 0, 0, 0, 0];
  const unison = 1 / Math.sqrt(detunes.length);

  const vibInc = 5.2 / sr;
  let vibPhase = 0;
  const vibRamp = Math.max(1, Math.floor(Math.min(0.4, ev.dur * 0.6) * sr));

  for (let i = 0; i < n; i++) {
    if (i % COEF_INTERVAL === 0) {
      lp.set(1200 + (openTo - 1200) * Math.min(1, i / openSamples), 1.4);
    }
    vibPhase = wrap(vibPhase + vibInc);
    const vib = cents(sine(vibPhase) * Math.min(1, i / vibRamp) * 8);
    let v = 0;
    for (let k = 0; k < detunes.length; k++) {
      const inc = (ev.freq * cents(detunes[k]) * vib) / sr;
      phases[k] = wrap(phases[k] + inc);
      v += saw(phases[k], inc) * unison;
    }
    lp.process(v);
    out[i] = lp.lp * env.next();
  }
  return n;
};

const GUITAR_ADSR: AdsrSpec = { attack: 0.005, decay: 0.24, sustain: 0.6, release: 0.16 };

const guitar: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Adsr.totalSamples(GUITAR_ADSR, ev.dur, sr));
  const env = new Adsr(GUITAR_ADSR, ev.vel * 0.34, ev.dur, sr);
  const band = new Svf(sr, 1100, 0.8);
  const lp = new OnePole(4600, sr);

  const inc = ev.freq / sr;
  const inc2 = (ev.freq * cents(5)) / sr;
  let p1 = 0;
  let p2 = 0;

  for (let i = 0; i < n; i++) {
    p1 = wrap(p1 + inc);
    p2 = wrap(p2 + inc2);
    band.process(saw(p1, inc) + square(p2, inc2) * 0.4);
    out[i] = lp.process(band.bp) * env.next();
  }
  return n;
};

const bell: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const decay = Math.max(0.6, Math.min(2.4, ev.dur * 2));
  const n = Math.min(out.length, Perc.totalSamples(0.004, decay, sr));
  const env = new Perc(ev.vel * 0.3, 0.004, decay, sr);

  // 非整数倍音を重ねると金属的な響きになる
  const ratios = [1, 2.76, 5.4];
  const gains = [1, 0.3, 0.12];
  const incs = ratios.map((r) => (ev.freq * r) / sr);
  const phases = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < ratios.length; k++) {
      phases[k] = wrap(phases[k] + incs[k]);
      v += sine(phases[k]) * gains[k];
    }
    out[i] = v * env.next();
  }
  return n;
};

/** レコードの針音。曲全体に薄く敷く */
const vinyl: VoiceRenderer = (out, ev, vc) => {
  const sr = vc.sampleRate;
  const n = Math.min(out.length, Math.floor(ev.dur * sr));
  const hp = new OnePoleHigh(220, sr);
  const lp = new OnePole(6200, sr);
  const fade = Math.max(1, Math.floor(0.8 * sr));

  for (let i = 0; i < n; i++) {
    const amp = ev.vel * Math.min(1, i / fade) * Math.min(1, (n - i) / fade);
    let v = lp.process(hp.process(vc.rng() * 2 - 1));
    // ときどきプチッというクリックを混ぜる
    if (vc.rng() < 0.00002) v += (vc.rng() * 2 - 1) * 6;
    out[i] = v * amp;
  }
  return n;
};

export const VOICES: Record<VoiceId, VoiceRenderer> = {
  kick,
  snare,
  clap,
  hatClosed: hat(0.05),
  hatOpen: hat(0.3),
  tom,
  ride,
  bass,
  sub808,
  epiano,
  piano,
  pad,
  strings,
  pluck,
  lead,
  guitar,
  bell,
  vinyl,
};
