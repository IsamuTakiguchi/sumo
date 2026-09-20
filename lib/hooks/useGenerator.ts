'use client';

import { useCallback, useRef, useState } from 'react';
import type { GenerationProgress, GenerationRequest, Track } from '@/lib/types';
import { getProvider, PassphraseError } from '@/lib/providers';
import { putCachedTrack } from '@/lib/storage/audioCache';

/** ライブラリの曲を作り直すときに引き継ぐ情報 */
export type TrackIdentity = Pick<Track, 'id' | 'title' | 'createdAt'>;

export function useGenerator() {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 合い言葉の入力し直しが必要なときだけ true */
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * @param identity 既存の曲として扱いたい場合に指定する。
   *   生成後に id を差し替えると、キャッシュの取り違えや
   *   Object URL の二重解放（＝再生できない曲）が起きるため、ここで確定させる。
   */
  const generate = useCallback(
    async (
      req: GenerationRequest,
      identity?: TrackIdentity,
    ): Promise<Track | null> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setNeedsPassphrase(false);
      setProgress({ stage: 'analyzing', ratio: 0, messageJa: '準備しています…' });

      try {
        const provider = getProvider(req.providerId);
        const generated = await provider.generate(req, {
          signal: controller.signal,
          onProgress: setProgress,
        });
        const track = identity ? { ...generated, ...identity } : generated;
        // シードから作り直せない曲（＝外部 AI）は、音声そのものを端末に残す。
        // 作り直しても同じ音にならず、そのたびに課金されるため。
        await putCachedTrack(track, !provider.supportsSeed);
        return track;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return null;
        if (e instanceof PassphraseError) setNeedsPassphrase(true);
        setError(e instanceof Error ? e.message : '生成に失敗しました');
        return null;
      } finally {
        abortRef.current = null;
        setProgress(null);
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    progress,
    error,
    needsPassphrase,
    generate,
    cancel,
    isGenerating: progress !== null,
  };
}
