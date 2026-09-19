'use client';

import type { ReactNode } from 'react';

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-ink-700/70 bg-ink-900/70 p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur sm:p-5 ${className}`}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold tracking-wide text-ink-100">{title}</h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function FieldLabel({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: string;
  /** 指定すると <label> として該当コントロールに紐づく */
  htmlFor?: string;
}) {
  const className = 'text-xs font-medium text-ink-300';
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={className}>
          {children}
        </label>
      ) : (
        <span className={className}>{children}</span>
      )}
      {hint && <span className="text-xs tabular-nums text-ink-400">{hint}</span>}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? 'border-accent-500 bg-accent-600/25 text-accent-400'
          : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-600 hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-850 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            o.value === value
              ? 'bg-accent-600/30 text-accent-400'
              : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({
  onClick,
  label,
  children,
  disabled,
  className = '',
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-lg border border-ink-700 bg-ink-850 text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
