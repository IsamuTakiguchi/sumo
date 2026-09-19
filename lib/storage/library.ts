/**
 * ライブラリの永続化。
 *
 * localStorage には TrackMeta（生成パラメータ・シード・セクション・歌詞）だけを保存し、
 * 音声データは保存しない。60 秒ステレオの WAV は 10MB を超えるため、
 * localStorage の 5MB 制限にはそもそも 1 曲も入らない。
 *
 * シードによる決定性があるので、再生時にパラメータから作り直せば
 * まったく同じ曲が得られる。ユーザーから見れば「保存されている」のと変わらない。
 *
 * （音声の実体をキャッシュしたくなったら IndexedDB が必要になる。
 *   その際は lib/storage/audioCache.ts の実装だけ差し替えればよい。）
 */

import type { TrackMeta } from '@/lib/types';

export const LIBRARY_KEY = 'sumo.library.v1';

interface LibraryFile {
  version: 1;
  tracks: TrackMeta[];
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function migrate(raw: unknown): LibraryFile {
  if (
    raw &&
    typeof raw === 'object' &&
    'version' in raw &&
    (raw as LibraryFile).version === 1 &&
    Array.isArray((raw as LibraryFile).tracks)
  ) {
    return raw as LibraryFile;
  }
  return { version: 1, tracks: [] };
}

/**
 * useSyncExternalStore 用の最小ストア。
 *
 * localStorage は React の外にある状態なので、effect の中で setState して
 * 同期するのではなく、外部ストアとして購読する。
 * こうするとサーバー描画時は空配列、ハイドレーション後に実データ、という
 * 切り替えを React 自身が面倒を見てくれる。
 */
const EMPTY: TrackMeta[] = [];
let snapshot: TrackMeta[] | null = null;
const listeners = new Set<() => void>();

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  // 他のタブでの変更も反映する
  const onStorage = (e: StorageEvent) => {
    if (e.key === LIBRARY_KEY) {
      snapshot = null;
      listener();
    }
  };
  if (isBrowser()) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (isBrowser()) window.removeEventListener('storage', onStorage);
  };
}

export function getLibrarySnapshot(): TrackMeta[] {
  if (snapshot === null) snapshot = loadLibrary();
  return snapshot;
}

export function getLibraryServerSnapshot(): TrackMeta[] {
  return EMPTY;
}

export function setLibrary(next: TrackMeta[]): void {
  snapshot = next;
  saveLibrary(next);
  for (const listener of listeners) listener();
}

export function loadLibrary(): TrackMeta[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    return migrate(JSON.parse(raw)).tracks;
  } catch {
    return [];
  }
}

export function saveLibrary(tracks: TrackMeta[]): void {
  if (!isBrowser()) return;
  const write = (list: TrackMeta[]) => {
    window.localStorage.setItem(
      LIBRARY_KEY,
      JSON.stringify({ version: 1, tracks: list } satisfies LibraryFile),
    );
  };

  let list = tracks;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      write(list);
      return;
    } catch {
      // 容量オーバー時は古いものから捨てて入るまで縮める
      if (list.length <= 1) return;
      list = list.slice(0, Math.max(1, Math.floor(list.length / 2)));
    }
  }
}
