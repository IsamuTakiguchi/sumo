'use client';

import type { GenreId } from '@/lib/types';
import { GENRE_LIST } from '@/lib/music/genres';

export function GenreGrid({
  value,
  onChange,
  disabled,
}: {
  value: GenreId;
  onChange: (g: GenreId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {GENRE_LIST.map((g) => {
        const selected = g.id === value;
        return (
          <button
            key={g.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(g.id)}
            aria-pressed={selected}
            className={`rounded-xl border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? 'border-accent-500 bg-accent-600/20'
                : 'border-ink-700 bg-ink-850 hover:border-ink-600'
            }`}
          >
            <div
              className={`text-xs font-semibold ${selected ? 'text-accent-400' : 'text-ink-100'}`}
            >
              {g.labelJa}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-400">
              {g.descJa}
            </div>
            <div className="mt-1 text-[10px] tabular-nums text-ink-400">
              {g.tempo[0]}–{g.tempo[1]} BPM
            </div>
          </button>
        );
      })}
    </div>
  );
}
