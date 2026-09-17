'use client';

import { FieldLabel } from '@/components/ui/primitives';
import { PROMPT_EXAMPLES } from '@/lib/music/prompt';

const MAX_LENGTH = 300;

export function PromptComposer({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel htmlFor="prompt-input" hint={`${value.length} / ${MAX_LENGTH}`}>
        どんな曲にしますか？
      </FieldLabel>
      <textarea
        id="prompt-input"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LENGTH))}
        disabled={disabled}
        rows={3}
        placeholder="例: 雨の夜、ネオンの街を歩くような切ないシティポップ"
        className="w-full resize-none rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none disabled:opacity-50"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PROMPT_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={disabled}
            onClick={() => onChange(ex)}
            className="max-w-full truncate rounded-md border border-ink-700/70 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-300 disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
