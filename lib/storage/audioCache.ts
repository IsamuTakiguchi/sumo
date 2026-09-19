/**
 * セッション中だけ音声を保持するメモリキャッシュ。
 *
 * 1 曲あたり 10〜20MB になるので、LRU で数件だけ持つ。
 * 追い出すときに Object URL を必ず解放する。
 *
 * 将来 IndexedDB に永続化したくなったら、この 3 つの関数の中身を
 * 差し替えるだけで済むようにしてある。
 */

import type { Track } from '@/lib/types';

const MAX_ENTRIES = 5;
const cache = new Map<string, Track>();

export function getCachedTrack(id: string): Track | undefined {
  const track = cache.get(id);
  if (track) {
    // 参照されたものを末尾に移して LRU を維持する
    cache.delete(id);
    cache.set(id, track);
  }
  return track;
}

export function putCachedTrack(track: Track): void {
  if (cache.has(track.id)) release(track.id);
  cache.set(track.id, track);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    release(oldest);
  }
}

export function release(id: string): void {
  const track = cache.get(id);
  if (!track) return;
  URL.revokeObjectURL(track.url);
  cache.delete(id);
}
