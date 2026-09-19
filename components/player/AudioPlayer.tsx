'use client';

import type { Track } from '@/lib/types';
import { Waveform } from './Waveform';
import { NowPlaying } from './NowPlaying';
import { IconButton } from '@/components/ui/primitives';
import { downloadBlob, slugify } from '@/lib/audio/wav';
import { formatSeed } from '@/lib/random';
import { formatTime } from '@/lib/format';
import { useAudioPlayer } from '@/lib/hooks/useAudioPlayer';

export function AudioPlayer({
  track,
  onRegenerateSameSeed,
}: {
  track: Track;
  onRegenerateSameSeed: () => void;
}) {
  const player = useAudioPlayer(track.url, track.durationSec);

  return (
    <div className="space-y-4">
      <NowPlaying track={track} />

      <Waveform
        peaks={track.peaks}
        duration={player.duration || track.durationSec}
        currentTime={player.currentTime}
        sections={track.sections}
        onSeek={player.seek}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={player.toggle}
          aria-label={player.isPlaying ? '一時停止' : '再生'}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-glow-500 text-white shadow-lg shadow-accent-600/25 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          {player.isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5Z" />
            </svg>
          )}
        </button>

        <div className="shrink-0 font-mono text-xs tabular-nums text-ink-300">
          {formatTime(player.currentTime)}
          <span className="mx-1 text-ink-600">/</span>
          {formatTime(player.duration || track.durationSec)}
        </div>

        <div className="flex min-w-[120px] flex-1 items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden
            className="shrink-0 text-ink-400"
          >
            <path d="M8 2 4.5 5H2v6h2.5L8 14V2Zm3.2 2.3a.75.75 0 0 1 1.05.14A5.98 5.98 0 0 1 13.5 8a5.98 5.98 0 0 1-1.25 3.56.75.75 0 1 1-1.19-.91A4.48 4.48 0 0 0 12 8a4.48 4.48 0 0 0-.94-2.65.75.75 0 0 1 .14-1.05Z" />
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            aria-label="音量"
            className="h-1 w-full"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            label="同じシードで作り直す"
            onClick={onRegenerateSameSeed}
            className="h-9 gap-1.5 px-3 text-xs"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 3V1L5 3.5 8 6V4a4 4 0 1 1-4 4H2.5A5.5 5.5 0 1 0 8 3Z" />
            </svg>
            再生成
          </IconButton>
          <IconButton
            label="WAV をダウンロード"
            onClick={() =>
              downloadBlob(
                track.blob,
                `sumo_${slugify(track.title)}_${formatSeed(track.spec.seed)}.wav`,
              )
            }
            className="h-9 gap-1.5 px-3 text-xs"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 1.5a.75.75 0 0 1 .75.75v6.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.22 2.22V2.25A.75.75 0 0 1 8 1.5ZM2.5 12a.75.75 0 0 1 .75.75v.75h9.5v-.75a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-.75.75h-11a.75.75 0 0 1-.75-.75v-1.5A.75.75 0 0 1 2.5 12Z" />
            </svg>
            WAV
          </IconButton>
        </div>
      </div>
    </div>
  );
}
