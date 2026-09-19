'use client';

/** 生成された歌詞を [セクション名] 区切りで表示する */
export function LyricsView({ lyrics }: { lyrics: string }) {
  const blocks = lyrics
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      const first = lines[0] ?? '';
      const m = /^\[(.+)\]$/.exec(first.trim());
      return m
        ? { label: m[1], lines: lines.slice(1) }
        : { label: null as string | null, lines };
    })
    .filter((b) => b.lines.length > 0);

  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <div key={i}>
          {b.label && (
            <div className="mb-1 text-[11px] font-medium tracking-wide text-accent-400">
              {b.label}
            </div>
          )}
          <div className="space-y-0.5 text-sm leading-relaxed text-ink-300">
            {b.lines.map((line, j) => (
              <p key={j}>{line}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
