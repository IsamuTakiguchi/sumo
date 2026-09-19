/**
 * 曲の骨組み（セクション構成）を決める。
 *
 * ジャンルごとのテンプレートを出発点に、指定された長さへ収まるよう
 * セクションを間引いたり小節数を伸縮したりする。
 */

import type { PartRole, ResolvedSpec, Section, SectionKind } from '@/lib/types';
import { chance, jitter, type Rng } from '@/lib/random';
import type { GenrePreset } from './genres';

const BASE_BARS: Record<SectionKind, number> = {
  intro: 4,
  verse: 8,
  prechorus: 4,
  chorus: 8,
  bridge: 4,
  break: 4,
  outro: 4,
};

const MIN_BARS: Record<SectionKind, number> = {
  intro: 2,
  verse: 4,
  prechorus: 2,
  chorus: 4,
  bridge: 2,
  break: 2,
  outro: 2,
};

/** セクション固有の基準エネルギー（0..1） */
const BASE_ENERGY: Record<SectionKind, number> = {
  intro: 0.26,
  verse: 0.52,
  prechorus: 0.68,
  chorus: 0.95,
  bridge: 0.44,
  break: 0.16,
  outro: 0.3,
};

export const SECTION_LABELS: Record<SectionKind, string> = {
  intro: 'イントロ',
  verse: 'Aメロ',
  prechorus: 'Bメロ',
  chorus: 'サビ',
  bridge: 'Cメロ',
  break: 'ブレイク',
  outro: 'アウトロ',
};

/** 同じ種類が 2 つ以上あるとき、どれから間引くか */
const DROP_DUPLICATE_PRIORITY: SectionKind[] = [
  'break',
  'bridge',
  'prechorus',
  'chorus',
  'verse',
  'intro',
  'outro',
];

/** もう重複が無いとき、どの種類ごと捨てるか（サビは必ず残す） */
const DROP_SINGLE_PRIORITY: SectionKind[] = [
  'break',
  'bridge',
  'prechorus',
  'intro',
  'outro',
  'verse',
];

/** 1 小節の秒数（4/4 拍子） */
export function barSeconds(tempo: number): number {
  return (60 / tempo) * 4;
}

export function beatSeconds(tempo: number): number {
  return 60 / tempo;
}

function sumBars(kinds: SectionKind[], table: Record<SectionKind, number>): number {
  return kinds.reduce((s, k) => s + table[k], 0);
}

/**
 * セクションを 1 つ削る。削れなければ false。
 *
 * まず「繰り返しの 2 回目以降」を削るのが肝心で、こうしないと短い曲のときに
 * A メロが全部消えて「サビだけの曲」になってしまう。
 * 後ろ側から削ると、曲の頭の印象が保たれる。
 */
function dropOne(kinds: SectionKind[]): boolean {
  for (const target of DROP_DUPLICATE_PRIORITY) {
    const count = kinds.filter((k) => k === target).length;
    if (count > 1) {
      kinds.splice(kinds.lastIndexOf(target), 1);
      return true;
    }
  }
  for (const target of DROP_SINGLE_PRIORITY) {
    const index = kinds.lastIndexOf(target);
    if (index >= 0) {
      kinds.splice(index, 1);
      return true;
    }
  }
  return false;
}

export function planSections(
  spec: ResolvedSpec,
  preset: GenrePreset,
  rng: Rng,
  targetDurationSec: number,
): Section[] {
  const barSec = barSeconds(spec.tempo);
  const targetBars = Math.max(6, Math.round(targetDurationSec / barSec));

  const kinds: SectionKind[] = [...preset.sectionTemplate];

  // 最小構成でも入りきらないうちはセクションを削る
  while (kinds.length > 2 && sumBars(kinds, MIN_BARS) > targetBars) {
    if (!dropOne(kinds)) break;
  }

  // 基準の比率を保ったまま、目標小節数へスケールする
  const baseTotal = sumBars(kinds, BASE_BARS);
  const factor = targetBars / baseTotal;
  const bars = kinds.map((k) => {
    const scaled = BASE_BARS[k] * factor;
    // 2 小節単位に丸める（音楽的に自然な区切り）
    return Math.max(MIN_BARS[k], Math.round(scaled / 2) * 2);
  });

  // 端数を、伸縮しても違和感の小さいセクションで吸収する
  let diff = targetBars - bars.reduce((s, b) => s + b, 0);
  const flexible = kinds
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => k === 'chorus' || k === 'verse')
    .map(({ i }) => i);
  const flexOrder = flexible.length > 0 ? flexible : kinds.map((_, i) => i);
  let guard = 0;
  while (diff !== 0 && guard < 200) {
    for (const i of flexOrder) {
      if (diff === 0) break;
      if (diff > 0) {
        bars[i] += 2;
        diff -= 2;
      } else if (bars[i] - 2 >= MIN_BARS[kinds[i]]) {
        bars[i] -= 2;
        diff += 2;
      }
    }
    guard++;
    // どのセクションもこれ以上縮められないなら諦める
    if (diff < 0 && flexOrder.every((i) => bars[i] - 2 < MIN_BARS[kinds[i]])) break;
  }

  const sections: Section[] = [];
  let bar = 0;
  let chorusCount = 0;
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    if (kind === 'chorus') chorusCount++;

    // 後半のサビほど少しだけ盛り上げる（ビルドアップ感）
    const buildUp = kind === 'chorus' ? Math.min(0.12, 0.04 * (chorusCount - 1)) : 0;
    const raw =
      BASE_ENERGY[kind] * (0.62 + 0.76 * spec.energy) +
      buildUp +
      jitter(rng, 0.03);
    const energy = Math.max(0.05, Math.min(1, raw));

    sections.push({
      kind,
      labelJa: SECTION_LABELS[kind],
      startBar: bar,
      bars: bars[i],
      startSec: bar * barSec,
      durSec: bars[i] * barSec,
      energy,
      activeRoles: rolesFor(kind, energy, spec, rng),
      chords: [],
    });
    bar += bars[i];
  }

  return sections;
}

function rolesFor(
  kind: SectionKind,
  energy: number,
  spec: ResolvedSpec,
  rng: Rng,
): PartRole[] {
  const roles: PartRole[] = ['harmony'];
  if (energy >= 0.24) roles.push('bass');
  if (energy >= 0.3) roles.push('drums');
  if (energy >= 0.3) roles.push('texture');
  if (energy >= 0.34) roles.push('arp');

  // メロディはイントロ／ブレイクでは基本的に休ませる
  const melodyAllowed =
    kind !== 'break' && (kind !== 'intro' || chance(rng, 0.35 + spec.density * 0.2));
  if (melodyAllowed && energy >= 0.32) roles.push('lead');

  return roles;
}
