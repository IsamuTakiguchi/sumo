/**
 * 音声そのものを端末に残すための IndexedDB ラッパ。
 *
 * 内蔵シンセの曲はシードから作り直せるので保存しない。
 * 外部 AI の曲は**同じ指示でも二度と同じ音にならない**うえ、作り直すたびに課金される。
 * つまり音声を捨てたら曲そのものが失われるので、こちらだけ実体を残す。
 *
 * 依存を増やさないよう素の IndexedDB を直接使う。
 * IndexedDB が使えない環境（プライベートウィンドウなど）では黙って何もしない。
 * その場合でもセッション中はメモリキャッシュで再生できる。
 */

import type { TrackMeta } from '@/lib/types';

const DB_NAME = 'sumo';
const DB_VERSION = 1;
const STORE = 'audio';

export interface StoredAudio {
  id: string;
  meta: TrackMeta;
  blob: Blob;
  peaks: Float32Array;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let req: IDBRequest<T>;
        try {
          req = body(db.transaction(STORE, mode).objectStore(STORE));
        } catch {
          resolve(null);
          return;
        }
        req.onsuccess = () => resolve(req.result);
        // 容量オーバーなどで失敗しても、生成そのものは成功させる
        req.onerror = () => resolve(null);
      }),
  );
}

export function saveAudio(entry: StoredAudio): Promise<void> {
  return run('readwrite', (s) => s.put(entry) as IDBRequest<IDBValidKey>).then(() => undefined);
}

export function loadAudio(id: string): Promise<StoredAudio | null> {
  return run<StoredAudio | undefined>('readonly', (s) => s.get(id) as IDBRequest<StoredAudio | undefined>)
    .then((v) => v ?? null);
}

export function deleteAudio(id: string): Promise<void> {
  return run('readwrite', (s) => s.delete(id) as IDBRequest<undefined>).then(() => undefined);
}

export function listAudioIds(): Promise<string[]> {
  return run<IDBValidKey[]>('readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>)
    .then((keys) => (keys ?? []).map(String));
}

/**
 * ライブラリに残っていない曲の音声を消す。
 * 履歴の件数制限で溢れたぶんが、孤児として容量を食い続けるのを防ぐ。
 */
export async function pruneAudio(keepIds: string[]): Promise<void> {
  const keep = new Set(keepIds);
  const ids = await listAudioIds();
  await Promise.all(ids.filter((id) => !keep.has(id)).map(deleteAudio));
}
