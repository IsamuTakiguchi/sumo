'use client';

import { Chip } from '@/components/ui/primitives';

export function TagChips<T extends string>({
  options,
  value,
  onChange,
  max,
  disabled,
}: {
  options: { id: T; labelJa: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const toggle = (id: T) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
      return;
    }
    if (max && value.length >= max) {
      // 上限に達していたら、いちばん古い選択を押し出す
      onChange([...value.slice(1), id]);
      return;
    }
    onChange([...value, id]);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip
          key={o.id}
          selected={value.includes(o.id)}
          disabled={disabled}
          onClick={() => toggle(o.id)}
        >
          {o.labelJa}
        </Chip>
      ))}
    </div>
  );
}
