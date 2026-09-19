'use client';

import { useState } from 'react';
import { FieldLabel } from '@/components/ui/primitives';
import { formatSeed, parseSeed } from '@/lib/random';

export function SeedField({
  seed,
  onChange,
  disabled,
}: {
  seed: number | null;
  onChange: (seed: number | null) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(seed === null ? '' : formatSeed(seed));
  const [prevSeed, setPrevSeed] = useState(seed);

  // 外側（生成後の自動反映や「同じシードで再生成」）から変わったら入力欄も追従させる。
  // effect ではなく描画中に調整するのが React 推奨のやり方（再描画の連鎖を避けられる）。
  if (seed !== prevSeed) {
    setPrevSeed(seed);
    setText(seed === null ? '' : formatSeed(seed));
  }

  const commit = (v: string) => {
    setText(v);
    onChange(parseSeed(v));
  };

  return (
    <div>
      <FieldLabel hint={seed === null ? '毎回ランダム' : undefined}>シード</FieldLabel>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-ink-700 bg-ink-850 px-2">
          <span className="select-none text-xs text-ink-400">#</span>
          <input
            value={text}
            disabled={disabled}
            onChange={(e) => commit(e.target.value)}
            placeholder="空欄でおまかせ"
            aria-label="シード値"
            className="w-full bg-transparent px-1 py-1.5 font-mono text-xs tracking-wider text-ink-100 placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-400 focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => commit('')}
          className="shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100 disabled:opacity-50"
        >
          クリア
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-400">
        同じシードと同じ設定なら、いつでもまったく同じ曲が再生成されます。
      </p>
    </div>
  );
}
