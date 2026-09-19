'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { TrackMeta } from '@/lib/types';
import {
  getLibrarySnapshot,
  getLibraryServerSnapshot,
  setLibrary,
  subscribeLibrary,
} from '@/lib/storage/library';

const MAX_TRACKS = 60;

/**
 * 生成履歴。
 *
 * localStorage は React の外の状態なので useSyncExternalStore で購読する。
 * サーバー描画時は空配列が返るため、ハイドレーションのずれも起きない。
 */
export function useLibrary() {
  const tracks = useSyncExternalStore(
    subscribeLibrary,
    getLibrarySnapshot,
    getLibraryServerSnapshot,
  );

  const add = useCallback((meta: TrackMeta) => {
    const prev = getLibrarySnapshot();
    setLibrary([meta, ...prev.filter((t) => t.id !== meta.id)].slice(0, MAX_TRACKS));
  }, []);

  const remove = useCallback((id: string) => {
    setLibrary(getLibrarySnapshot().filter((t) => t.id !== id));
  }, []);

  const clear = useCallback(() => setLibrary([]), []);

  return { tracks, add, remove, clear };
}
