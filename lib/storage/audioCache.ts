/**
 * 再生中の音声を取り回す層。メモリの LRU と IndexedDB の二段構え。
 *
 * - 内蔵シンセの曲 … メモリだけ。消えてもシードから作り直せば同じ音が返る
 * - 外部 AI の曲   … IndexedDB にも残す。作り直すと別の曲になり、課金もされるため
 *
 * 1 曲あたり 1〜20MB になるので、メモリには数件しか置かない。
 * 追い出すときに Object URL を必ず解放する。
 */

import type { Track, TrackMeta } from '@/lib/types';
import { deleteAudio, loadAudio, pruneAudio, saveAudio } from './audioStore';

const MAX_ENTRIES = 5;
const cache = new Map<string, Track>();

/** メモリから外して Object URL を解放する。IndexedDB の実体は残す */
export function releaseMemory(id: string): void {
  const track = cache.get(id);
  if (!track) return;
  URL.revokeObjectURL(track.url);
  cache.delete(id);
}

export async function getCachedTrack(id: string): Promise<Track | undefined> {
  const track = cache.get(id);
  if (track) {
    // 参照されたものを末尾に移して LRU を維持する
    cache.delete(id);
    cache.set(id, track);
    return track;
  }

  const stored = await loadAudio(id);
  if (!stored) return undefined;

  const restored: Track = {
    ...stored.meta,
    blob: stored.blob,
    url: URL.createObjectURL(stored.blob),
    peaks: stored.peaks,
    arrangement: null,
  };
  remember(restored);
  return restored;
}

function remember(track: Track): void {
  if (cache.has(track.id)) releaseMemory(track.id);
  cache.set(track.id, track);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    releaseMemory(oldest);
  }
}

/**
 * @param persist 作り直しでは元に戻せない曲（＝外部 AI）のとき true。
 *   音声の実体を IndexedDB に残す。
 */
export async function putCachedTrack(track: Track, persist: boolean): Promise<void> {
  remember(track);
  if (!persist) return;
  const meta: TrackMeta = {
    id: track.id,
    title: track.title,
    createdAt: track.createdAt,
    request: track.request,
    spec: track.spec,
    durationSec: track.durationSec,
    sections: track.sections,
    lyrics: track.lyrics,
    providerId: track.providerId,
  };
  await saveAudio({ id: track.id, meta, blob: track.blob, peaks: track.peaks });
}

/** 曲を削除する。メモリからも端末からも消す */
export async function forgetTrack(id: string): Promise<void> {
  releaseMemory(id);
  await deleteAudio(id);
}

/** ライブラリに残っていない曲の音声を端末から消す */
export async function pruneAudioTo(keepIds: string[]): Promise<void> {
  await pruneAudio(keepIds);
}
