'use client';

import type { Track } from '@/lib/types';
import { GENRE_PRESETS } from '@/lib/music/genres';
import { MOOD_MAP } from '@/lib/music/moods';
import { keyLabelJa } from '@/lib/music/theory';
import { formatSeed } from '@/lib/random';
import { formatTime } from '@/lib/format';

export function NowPlaying({ track }: { track: Track }) {
  const preset = GENRE_PRESETS[track.spec.genre];
  const facts = [
    preset.labelJa,
    `${track.spec.tempo} BPM`,
    keyLabelJa(track.spec.key.root, track.spec.key.scale),
    formatTime(track.durationSec),
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight text-ink-100">{track.title}</h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
        {facts.map((f, i) => (
          <span key={f + i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="text-ink-600">·</span>}
            {f}
          </span>
        ))}
      </div>
      {track.spec.moods.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {track.spec.moods.map((m) => (
            <span
              key={m}
              className="rounded-full border border-ink-700 px-2 py-0.5 text-[11px] text-ink-300"
            >
              {MOOD_MAP[m].labelJa}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 font-mono text-[11px] tracking-wider text-ink-400">
        seed #{formatSeed(track.spec.seed)}
      </div>
    </div>
  );
}
