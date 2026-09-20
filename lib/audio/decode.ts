/**
 * 外から受け取った音声（MP3 など）を、波形表示に使う StereoBuffer へ変換する。
 *
 * 内蔵シンセは最初から StereoBuffer を作るのでこの経路を通らない。
 * ここはデコードのためだけに Web Audio を使う。再生は `<audio>` に任せ、
 * MP3 は再エンコードせずそのまま持ち回る（劣化させないため）。
 */

import { createStereo, type StereoBuffer } from './dsp';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export async function decodeToStereo(blob: Blob): Promise<StereoBuffer> {
  const Ctor = getAudioContextCtor();
  const bytes = await blob.arrayBuffer();

  if (!Ctor) {
    // デコードできない環境でも曲自体は再生できる。波形だけ諦める
    return createStereo(0, 44100);
  }

  const ctx = new Ctor();
  try {
    const decoded = await ctx.decodeAudioData(bytes);
    const out = createStereo(decoded.length, decoded.sampleRate);
    out.left.set(decoded.getChannelData(0));
    // モノラルなら左をそのまま右にも回す
    out.right.set(decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : decoded.getChannelData(0));
    return out;
  } catch {
    return createStereo(0, 44100);
  } finally {
    void ctx.close();
  }
}
