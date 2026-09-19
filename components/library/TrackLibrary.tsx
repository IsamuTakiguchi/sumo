'use client';

import type { TrackMeta } from '@/lib/types';
import { GENRE_PRESETS } from '@/lib/music/genres';
import { formatDate, formatTime } from '@/lib/format';
import { formatSeed } from '@/lib/random';

export function TrackLibrary({
  tracks,
  currentId,
  loadingId,
  onSelect,
  onRemove,
  disabled,
}: {
  tracks: TrackMeta[];
  currentId: string | null;
  loadingId: string | null;
  onSelect: (meta: TrackMeta) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  if (tracks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-700 px-4 py-8 text-center">
        <p className="text-sm text-ink-300">まだ曲がありません</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-400">
          生成した曲はこの端末に保存され、
          <br />
          いつでも同じ音で聴き直せます。
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {tracks.map((t) => {
        const active = t.id === currentId;
        const loading = t.id === loadingId;
        return (
          <li key={t.id}>
            <div
              className={`group flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                active
                  ? 'border-accent-500/70 bg-accent-600/15'
                  : 'border-ink-700/70 bg-ink-850/60 hover:border-ink-600'
              }`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(t)}
                className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`truncate text-sm ${active ? 'text-accent-400' : 'text-ink-100'}`}
                  >
                    {t.title}
                  </span>
                  {loading && (
                    <span className="shrink-0 text-[10px] text-ink-400">準備中…</span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-ink-400">
                  {GENRE_PRESETS[t.spec.genre].labelJa} · {t.spec.tempo} BPM ·{' '}
                  {formatTime(t.durationSec)} · {formatDate(t.createdAt)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] tracking-wider text-ink-600">
                  #{formatSeed(t.spec.seed)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onRemove(t.id)}
                aria-label={`${t.title} を削除`}
                className="shrink-0 rounded-md p-1.5 text-ink-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-glow-400 focus:opacity-100 focus:outline-none"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path d="M6.5 1.5h3a.5.5 0 0 1 .5.5v.5h3a.75.75 0 0 1 0 1.5h-.4l-.6 9a1.5 1.5 0 0 1-1.5 1.4H5.5A1.5 1.5 0 0 1 4 13l-.6-9H3a.75.75 0 0 1 0-1.5h3V2a.5.5 0 0 1 .5-.5Z" />
                </svg>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
