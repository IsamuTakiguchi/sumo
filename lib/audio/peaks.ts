/**
 * 波形表示用に、音声を一定数のバケットへ間引く。
 * 表示にはこれだけあれば十分なので、音声本体を保持し続けなくてよい。
 */

import type { StereoBuffer } from './dsp';

export function computePeaks(
  buffer: StereoBuffer,
  buckets = 1200,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(new ArrayBuffer(buckets * 4));
  const frames = buffer.length;
  if (frames === 0) return out;

  const { left, right } = buffer;
  const per = frames / buckets;

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(frames, Math.floor((b + 1) * per));
    // 長い曲でも一定時間で終わるよう、バケット内はさらに間引いて走査する
    const stride = Math.max(1, Math.floor((end - start) / 512));
    let peak = 0;
    for (let i = start; i < end; i += stride) {
      const v = (Math.abs(left[i]) + Math.abs(right[i])) * 0.5;
      if (v > peak) peak = v;
    }
    out[b] = peak;
  }

  // 表示映えするよう、最大値が 1 になるように正規化する
  let max = 0;
  for (const v of out) if (v > max) max = v;
  if (max > 0) {
    for (let i = 0; i < out.length; i++) out[i] /= max;
  }
  return out;
}
