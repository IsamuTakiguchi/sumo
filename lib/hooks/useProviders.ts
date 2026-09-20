'use client';

import { useSyncExternalStore } from 'react';
import { listProviders, localSynthProvider, type MusicProvider } from '@/lib/providers';

/**
 * いま使えるプロバイダの一覧。
 *
 * isAvailable() は window や環境変数を見るのでサーバー描画時には確定しない。
 * useSyncExternalStore でサーバー用のスナップショットを分け、
 * ハイドレーションのずれを避ける（useLibrary と同じ形）。
 */

const SERVER_SNAPSHOT: MusicProvider[] = [localSynthProvider];
let clientSnapshot: MusicProvider[] | null = null;

/** 変化しないので購読は何もしない。スナップショットは同一参照を返す */
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): MusicProvider[] {
  clientSnapshot ??= listProviders();
  return clientSnapshot;
}

function getServerSnapshot(): MusicProvider[] {
  return SERVER_SNAPSHOT;
}

export function useProviders(): MusicProvider[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
