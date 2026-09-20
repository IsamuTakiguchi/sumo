'use client';

import type { Track } from '@/lib/types';
import { GENRE_PRESETS } from '@/lib/music/genres';
import { MOOD_MAP } from '@/lib/music/moods';
import { keyLabelJa } from '@/lib/music/theory';
import { formatSeed } from '@/lib/random';
import { formatTime } from '@/lib/format';

export function NowPlaying({ track }: { track: Track }) {
  const spec = track.spec;
  // AI で作った曲は BPM もキーもモデルから返らない。それらしい値を捏造せず、伏せる
  const facts = spec
    ? [
        GENRE_PRESETS[spec.genre].labelJa,
        `${spec.tempo} BPM`,
        keyLabelJa(spec.key.root, spec.key.scale),
        formatTime(track.durationSec),
      ]
    : [
        GENRE_PRESETS[track.request.genre].labelJa,
        'ElevenLabs Music',
        formatTime(track.durationSec),
      ];
  const moods = spec ? spec.moods : track.request.moods;

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
      {moods.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {moods.map((m) => (
            <span
              key={m}
              className="rounded-full border border-ink-700 px-2 py-0.5 text-[11px] text-ink-300"
            >
              {MOOD_MAP[m].labelJa}
            </span>
          ))}
        </div>
      )}
      {spec && (
        <div className="mt-2 font-mono text-[11px] tracking-wider text-ink-400">
          seed #{formatSeed(spec.seed)}
        </div>
      )}
    </div>
  );
}
