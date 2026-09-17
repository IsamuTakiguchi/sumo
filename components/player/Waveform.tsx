'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { SectionSummary } from '@/lib/types';

const SECTION_COLORS: Record<string, string> = {
  intro: 'rgba(123,123,152,0.35)',
  verse: 'rgba(91,124,250,0.45)',
  prechorus: 'rgba(124,156,255,0.5)',
  chorus: 'rgba(242,79,174,0.6)',
  bridge: 'rgba(160,110,240,0.5)',
  break: 'rgba(90,90,120,0.4)',
  outro: 'rgba(123,123,152,0.35)',
};

/**
 * Canvas による波形表示。
 * ミラー型の棒グラフで、再生済みの部分だけ色を変える。クリック／ドラッグでシーク。
 */
export function Waveform({
  peaks,
  duration,
  currentTime,
  sections,
  onSeek,
}: {
  peaks: Float32Array | null;
  duration: number;
  currentTime: number;
  sections: SectionSummary[];
  onSeek: (sec: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (width === 0 || height === 0) return;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const playedX = progress * width;

    if (!peaks || peaks.length === 0) {
      ctx.fillStyle = 'rgba(123,123,152,0.25)';
      ctx.fillRect(0, height / 2 - 1, width, 2);
      return;
    }

    const bars = Math.max(24, Math.min(peaks.length, Math.floor(width / 3)));
    const barWidth = width / bars;
    const mid = height / 2;

    for (let i = 0; i < bars; i++) {
      // 表示幅に合わせて peaks を間引く
      const from = Math.floor((i * peaks.length) / bars);
      const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / bars));
      let v = 0;
      for (let p = from; p < to; p++) if (peaks[p] > v) v = peaks[p];

      const x = i * barWidth;
      const h = Math.max(1.5, v * (height * 0.46));
      const played = x + barWidth / 2 <= playedX;
      ctx.fillStyle = played ? 'rgba(124,156,255,0.95)' : 'rgba(123,123,152,0.45)';
      ctx.fillRect(x + barWidth * 0.15, mid - h, Math.max(1, barWidth * 0.7), h * 2);
    }

    // 再生位置のライン
    ctx.fillStyle = 'rgba(242,79,174,0.95)';
    ctx.fillRect(Math.max(0, playedX - 1), 0, 2, height);
  }, [peaks, duration, currentTime]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const wrap = wrapRef.current;
      if (!wrap || duration <= 0) return;
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  return (
    <div className="select-none">
      <div
        ref={wrapRef}
        role="slider"
        tabIndex={0}
        aria-label="再生位置"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) seekFromEvent(e.clientX);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onSeek(Math.min(duration, currentTime + 5));
          if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 5));
        }}
        className="h-24 w-full cursor-pointer rounded-lg bg-ink-850/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {sections.length > 0 && duration > 0 && (
        <div className="mt-1.5 flex h-5 w-full gap-px overflow-hidden rounded">
          {sections.map((s, i) => (
            <div
              key={`${s.kind}-${i}`}
              title={`${s.labelJa}（${Math.round(s.startSec)}秒〜）`}
              onClick={() => onSeek(s.startSec)}
              style={{
                width: `${(s.durSec / duration) * 100}%`,
                backgroundColor: SECTION_COLORS[s.kind] ?? 'rgba(123,123,152,0.4)',
              }}
              className="flex cursor-pointer items-center justify-center overflow-hidden text-[9px] whitespace-nowrap text-white/85 transition-opacity hover:opacity-80"
            >
              {s.labelJa}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
