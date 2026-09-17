'use client';

import type { GenerationProgress } from '@/lib/types';

export function GenerateBar({
  progress,
  onGenerate,
  onCancel,
  estimateSec,
}: {
  progress: GenerationProgress | null;
  onGenerate: () => void;
  onCancel: () => void;
  estimateSec: number;
}) {
  if (progress) {
    const pct = Math.round(progress.ratio * 100);
    return (
      <div className="rounded-xl border border-accent-500/50 bg-accent-600/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="text-accent-400">{progress.messageJa}</span>
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-ink-300">{pct}%</span>
            <button
              type="button"
              onClick={onCancel}
              className="text-ink-400 underline-offset-2 hover:text-ink-100 hover:underline"
            >
              中止
            </button>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-500 to-glow-500 transition-[width] duration-200"
            style={{ width: `${Math.max(3, pct)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onGenerate}
        className="w-full rounded-xl bg-gradient-to-r from-accent-600 to-glow-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-600/20 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        この設定で生成する
      </button>
      <p className="mt-1.5 text-center text-[11px] text-ink-400">
        目安 {estimateSec} 秒ほどで完成します
      </p>
    </div>
  );
}
