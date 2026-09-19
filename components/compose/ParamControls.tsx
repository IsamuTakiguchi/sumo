'use client';

import type { PitchClass, ScaleId } from '@/lib/types';
import { FieldLabel, Segmented } from '@/components/ui/primitives';
import { NOTE_NAMES, SCALE_LABELS_JA } from '@/lib/music/theory';

const DURATIONS = [30, 60, 90, 120];
const SCALES: ScaleId[] = [
  'major',
  'minor',
  'dorian',
  'mixolydian',
  'lydian',
  'phrygian',
  'harmonicMinor',
  'majorPentatonic',
  'minorPentatonic',
];

export interface ParamValues {
  tempo: number | null;
  durationSec: number;
  key: { root: PitchClass; scale: ScaleId } | null;
  vocal: 'instrumental' | 'lyrics';
}

export function ParamControls({
  values,
  onChange,
  tempoRange,
  disabled,
}: {
  values: ParamValues;
  onChange: (v: Partial<ParamValues>) => void;
  tempoRange: [number, number];
  disabled?: boolean;
}) {
  const autoTempo = values.tempo === null;
  const autoKey = values.key === null;

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel hint={autoTempo ? 'おまかせ' : `${values.tempo} BPM`}>テンポ</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={50}
            max={190}
            step={1}
            disabled={disabled || autoTempo}
            value={values.tempo ?? Math.round((tempoRange[0] + tempoRange[1]) / 2)}
            onChange={(e) => onChange({ tempo: Number(e.target.value) })}
            className="h-1 flex-1 disabled:opacity-40"
            aria-label="テンポ（BPM）"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-300">
            <input
              type="checkbox"
              checked={autoTempo}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  tempo: e.target.checked
                    ? null
                    : Math.round((tempoRange[0] + tempoRange[1]) / 2),
                })
              }
              className="accent-accent-500"
            />
            おまかせ
          </label>
        </div>
      </div>

      <div>
        <FieldLabel>長さ</FieldLabel>
        <Segmented
          disabled={disabled}
          value={values.durationSec}
          onChange={(v) => onChange({ durationSec: v })}
          options={DURATIONS.map((d) => ({ value: d, label: `${d}秒` }))}
        />
      </div>

      <div>
        <FieldLabel hint={autoKey ? 'おまかせ' : undefined}>キー</FieldLabel>
        <div className="flex items-center gap-2">
          <select
            disabled={disabled || autoKey}
            value={values.key?.root ?? 0}
            onChange={(e) =>
              onChange({
                key: {
                  root: Number(e.target.value) as PitchClass,
                  scale: values.key?.scale ?? 'major',
                },
              })
            }
            aria-label="キーの主音"
            className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-xs text-ink-100 disabled:opacity-40"
          >
            {NOTE_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
          <select
            disabled={disabled || autoKey}
            value={values.key?.scale ?? 'major'}
            onChange={(e) =>
              onChange({
                key: {
                  root: values.key?.root ?? 0,
                  scale: e.target.value as ScaleId,
                },
              })
            }
            aria-label="スケール"
            className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-xs text-ink-100 disabled:opacity-40"
          >
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {SCALE_LABELS_JA[s]}
              </option>
            ))}
          </select>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-300">
            <input
              type="checkbox"
              checked={autoKey}
              disabled={disabled}
              onChange={(e) =>
                onChange({ key: e.target.checked ? null : { root: 0, scale: 'major' } })
              }
              className="accent-accent-500"
            />
            おまかせ
          </label>
        </div>
      </div>

      <div>
        <FieldLabel>歌詞</FieldLabel>
        <Segmented
          disabled={disabled}
          value={values.vocal}
          onChange={(v) => onChange({ vocal: v })}
          options={[
            { value: 'instrumental' as const, label: 'インスト' },
            { value: 'lyrics' as const, label: '歌詞あり' },
          ]}
        />
        {values.vocal === 'lyrics' && (
          <p className="mt-1.5 text-[11px] leading-snug text-ink-400">
            ※ 歌詞はテキストとして生成されます。歌声の合成は行いません。
          </p>
        )}
      </div>
    </div>
  );
}
