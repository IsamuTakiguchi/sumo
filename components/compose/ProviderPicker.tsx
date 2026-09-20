'use client';

import type { MusicProvider } from '@/lib/providers';
import { FieldLabel } from '@/components/ui/primitives';

/**
 * 生成バックエンドの選択。
 *
 * 選択肢が 1 つしか無い（＝ AI が未設定）ときは何も出さない。
 * 選べないものを見せても混乱するだけなので。
 */
export function ProviderPicker({
  providers,
  value,
  onChange,
  disabled,
}: {
  providers: MusicProvider[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  if (providers.length < 2) return null;

  return (
    <div>
      <FieldLabel>生成エンジン</FieldLabel>
      <div className="space-y-1.5">
        {providers.map((p) => {
          const active = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p.id)}
              aria-pressed={active}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                active
                  ? 'border-accent-500 bg-accent-600/10'
                  : 'border-ink-700 bg-ink-850 hover:border-ink-600'
              }`}
            >
              <div
                className={`text-xs font-medium ${active ? 'text-accent-400' : 'text-ink-200'}`}
              >
                {p.labelJa}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-400">{p.descJa}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
