'use client';

import { useState } from 'react';
import { FieldLabel } from '@/components/ui/primitives';

/**
 * AI 生成を使うための合い言葉。
 *
 * このサイトは誰でも開けるので、何もしないと見知らぬ人がサイト所有者の
 * API キーで曲を作れてしまう。サーバー側の APP_PASSPHRASE と一致したときだけ
 * 生成を通す。入力値は端末に残り、次回から省略できる。
 */
export function PassphraseField({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <FieldLabel htmlFor="passphrase-input" hint="この端末に保存されます">
        合い言葉
      </FieldLabel>
      <div className="flex gap-2">
        <input
          id="passphrase-input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          className={`min-w-0 flex-1 rounded-lg border bg-ink-850 px-3 py-2 text-xs text-ink-100 placeholder:text-ink-600 focus:outline-none disabled:opacity-50 ${
            invalid ? 'border-glow-500' : 'border-ink-700 focus:border-accent-500'
          }`}
          placeholder="サーバーに設定した合い言葉"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 rounded-lg border border-ink-700 px-2.5 text-[11px] text-ink-300 hover:border-ink-600"
        >
          {visible ? '隠す' : '表示'}
        </button>
      </div>
      {invalid && (
        <p className="mt-1.5 text-[11px] text-glow-400">
          合い言葉が違います。入力し直してください。
        </p>
      )}
    </div>
  );
}
