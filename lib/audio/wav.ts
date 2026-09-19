/**
 * StereoBuffer → WAV(16bit PCM)。
 * 再生（<audio> の src）とダウンロードの両方で同じ Blob を使い回す。
 */

import type { StereoBuffer } from './dsp';

export function encodeWav(buffer: StereoBuffer): ArrayBuffer {
  const numCh = 2;
  const { sampleRate, length } = buffer;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = length * blockAlign;

  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt チャンクのサイズ
  view.setUint16(20, 1, true); // 1 = リニア PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const { left, right } = buffer;
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  return out;
}

export function encodeWavBlob(buffer: StereoBuffer): Blob {
  return new Blob([encodeWav(buffer)], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** ダウンロードを起動する。Object URL は少し遅らせて解放する */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** ファイル名に使える形へ整える */
export function slugify(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_');
  return cleaned.slice(0, 40) || 'track';
}
