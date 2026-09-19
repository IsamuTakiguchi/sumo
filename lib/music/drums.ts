/**
 * ドラムパターンの定義と生成。
 *
 * パターンは 1 小節 16 ステップのレーン（各値はベロシティ 0..1、0 は休符）。
 * これにスイング・ヒューマナイズ・フィル・ゴーストノートを重ねる。
 */

import type { NoteEvent, ResolvedSpec, Section, VoiceId } from '@/lib/types';
import { chance, jitter, pick, type Rng } from '@/lib/random';
import type { GenrePreset } from './genres';
import { barSeconds, beatSeconds } from './structure';

export interface DrumPattern {
  id: string;
  lanes: Partial<Record<VoiceId, number[]>>;
  /** ハイハットを 16 分でロールさせる確率（トラップ用） */
  roll?: number;
}

const _ = 0;

export const DRUM_PATTERNS: Record<string, DrumPattern> = {
  boombap: {
    id: 'boombap',
    lanes: {
      kick: [1, _, _, _, _, _, 0.8, _, _, _, 0.9, _, _, _, _, _],
      snare: [_, _, _, _, 1, _, _, _, _, _, _, _, 0.95, _, _, 0.3],
      hatClosed: [0.6, _, 0.4, _, 0.55, _, 0.4, _, 0.6, _, 0.4, _, 0.55, _, 0.45, 0.3],
    },
  },
  laidback: {
    id: 'laidback',
    lanes: {
      kick: [1, _, _, _, _, _, _, _, 0.85, _, _, _, _, _, 0.6, _],
      snare: [_, _, _, _, 0.9, _, _, 0.22, _, _, _, _, 0.92, _, _, _],
      hatClosed: [0.5, _, 0.35, _, 0.5, _, 0.35, _, 0.5, _, 0.35, _, 0.5, _, 0.4, _],
    },
  },
  citypop16: {
    id: 'citypop16',
    lanes: {
      kick: [1, _, _, _, _, _, 0.7, _, _, _, 0.85, _, _, _, 0.5, _],
      snare: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, _],
      hatClosed: [0.5, 0.3, 0.45, 0.3, 0.5, 0.3, 0.45, 0.3, 0.5, 0.3, 0.45, 0.3, 0.5, 0.3, 0.45, 0.35],
      hatOpen: [_, _, _, _, _, _, _, 0.4, _, _, _, _, _, _, _, 0.45],
    },
  },
  discoFour: {
    id: 'discoFour',
    lanes: {
      kick: [1, _, _, _, 0.95, _, _, _, 1, _, _, _, 0.95, _, _, _],
      snare: [_, _, _, _, 0.9, _, _, _, _, _, _, _, 0.9, _, _, _],
      hatClosed: [0.45, 0.3, 0.45, 0.3, 0.45, 0.3, 0.45, 0.3, 0.45, 0.3, 0.45, 0.3, 0.45, 0.3, 0.45, 0.3],
      hatOpen: [_, _, 0.5, _, _, _, 0.5, _, _, _, 0.5, _, _, _, 0.5, _],
    },
  },
  fourOnFloor: {
    id: 'fourOnFloor',
    lanes: {
      kick: [1, _, _, _, 1, _, _, _, 1, _, _, _, 1, _, _, _],
      clap: [_, _, _, _, 0.95, _, _, _, _, _, _, _, 0.95, _, _, _],
      hatClosed: [_, _, 0.4, _, _, _, 0.4, _, _, _, 0.4, _, _, _, 0.4, _],
      hatOpen: [_, _, _, _, _, _, 0.55, _, _, _, _, _, _, _, 0.55, _],
    },
  },
  houseShuffle: {
    id: 'houseShuffle',
    lanes: {
      kick: [1, _, _, _, 1, _, _, _, 1, _, _, _, 1, _, _, _],
      clap: [_, _, _, _, 0.9, _, _, _, _, _, _, _, 0.9, _, _, 0.3],
      hatClosed: [_, 0.3, 0.45, _, _, 0.3, 0.45, _, _, 0.3, 0.45, _, _, 0.3, 0.45, _],
      hatOpen: [_, _, _, _, _, _, 0.5, _, _, _, _, _, _, _, 0.5, _],
    },
  },
  rock8: {
    id: 'rock8',
    lanes: {
      kick: [1, _, _, _, _, _, 0.75, _, 0.9, _, _, _, _, _, _, _],
      snare: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, _],
      hatClosed: [0.65, _, 0.45, _, 0.65, _, 0.45, _, 0.65, _, 0.45, _, 0.65, _, 0.45, _],
    },
  },
  halfTimeRock: {
    id: 'halfTimeRock',
    lanes: {
      kick: [1, _, _, _, _, _, _, _, _, _, 0.85, _, _, _, _, _],
      snare: [_, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _],
      hatClosed: [0.6, _, 0.4, _, 0.6, _, 0.4, _, 0.6, _, 0.4, _, 0.6, _, 0.4, _],
    },
  },
  sparse: {
    id: 'sparse',
    lanes: {
      kick: [0.7, _, _, _, _, _, _, _, 0.55, _, _, _, _, _, _, _],
      hatClosed: [_, _, _, _, 0.25, _, _, _, _, _, _, _, 0.25, _, _, _],
    },
  },
  swingRide: {
    id: 'swingRide',
    lanes: {
      ride: [0.55, _, 0.3, _, 0.5, _, 0.35, _, 0.55, _, 0.3, _, 0.5, _, 0.35, _],
      snare: [_, _, _, _, 0.3, _, _, 0.18, _, _, _, _, 0.35, _, _, 0.2],
      kick: [0.5, _, _, _, _, _, _, _, 0.4, _, _, _, _, _, 0.3, _],
    },
  },
  bossa: {
    id: 'bossa',
    lanes: {
      ride: [0.4, _, 0.3, _, 0.4, _, 0.3, _, 0.4, _, 0.3, _, 0.4, _, 0.3, _],
      snare: [0.3, _, _, 0.25, _, _, 0.3, _, _, 0.25, _, _, 0.3, _, _, _],
      kick: [0.6, _, _, _, _, _, 0.5, _, 0.55, _, _, _, _, _, 0.45, _],
    },
  },
  trapRoll: {
    id: 'trapRoll',
    lanes: {
      kick: [1, _, _, _, _, _, 0.8, _, _, 0.7, _, _, _, _, _, _],
      snare: [_, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _],
      hatClosed: [0.5, 0.35, 0.5, 0.35, 0.5, 0.35, 0.5, 0.35, 0.5, 0.35, 0.5, 0.35, 0.5, 0.35, 0.5, 0.35],
    },
    roll: 0.3,
  },
  trapSparse: {
    id: 'trapSparse',
    lanes: {
      kick: [1, _, _, _, _, _, _, _, _, _, 0.85, _, _, _, _, _],
      snare: [_, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _],
      hatClosed: [0.5, _, 0.4, _, 0.5, _, 0.4, _, 0.5, _, 0.4, _, 0.5, _, 0.4, _],
    },
    roll: 0.18,
  },
  epicTaiko: {
    id: 'epicTaiko',
    lanes: {
      kick: [1, _, _, _, _, _, _, _, 0.9, _, _, _, 0.7, _, _, _],
      tom: [_, _, _, _, 0.7, _, 0.5, _, _, _, _, _, 0.65, _, 0.5, _],
    },
  },
};

/** ドラムの代表周波数（音程を持つものだけ意味がある） */
const DRUM_FREQ: Partial<Record<VoiceId, number>> = {
  kick: 50,
  snare: 190,
  clap: 1200,
  hatClosed: 8000,
  hatOpen: 8000,
  tom: 120,
  ride: 6000,
};

/** エネルギーが低いときに真っ先に消えるレーン */
const LANE_PRIORITY: VoiceId[] = ['kick', 'snare', 'clap', 'hatClosed', 'ride', 'tom', 'hatOpen'];

export function generateDrums(
  sections: Section[],
  spec: ResolvedSpec,
  preset: GenrePreset,
  rng: Rng,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  const barSec = barSeconds(spec.tempo);
  const stepSec = barSec / 16;
  const beatSec = beatSeconds(spec.tempo);

  // 曲全体で基本パターンを 1 つ、低エネルギー用に控えめなものを 1 つ
  const mainPattern = DRUM_PATTERNS[pick(rng, preset.drumPatterns)];
  const calmPattern = DRUM_PATTERNS[preset.drumPatterns[preset.drumPatterns.length - 1]];

  for (const section of sections) {
    if (!section.activeRoles.includes('drums')) continue;
    const pattern = section.energy < 0.45 ? calmPattern : mainPattern;

    for (let b = 0; b < section.bars; b++) {
      const barStart = section.startSec + b * barSec;
      const isLastBar = b === section.bars - 1;
      const doFill = isLastBar && section.bars >= 4 && chance(rng, 0.7);

      for (const [voiceKey, lane] of Object.entries(pattern.lanes)) {
        const voice = voiceKey as VoiceId;
        if (!lane) continue;
        if (!laneEnabled(voice, section.energy)) continue;
        // フィルの小節ではスネア／タム以外を薄くする
        if (doFill && (voice === 'snare' || voice === 'tom')) continue;

        for (let step = 0; step < 16; step++) {
          const base = lane[step];
          if (!base) continue;
          // フィル中は後半 2 拍を空ける
          if (doFill && step >= 8 && voice !== 'kick') continue;

          const time = barStart + step * stepSec + swingOffset(step, stepSec, spec.swing);
          events.push(
            drumHit(voice, time, base, section.energy, preset.humanize, rng, stepSec),
          );
        }

        // ハイハットのロール（トラップ）
        if (voice === 'hatClosed' && pattern.roll && chance(rng, pattern.roll)) {
          const rollStart = barStart + 12 * stepSec;
          const div = pick(rng, [3, 4, 6]);
          for (let r = 0; r < div; r++) {
            const t = rollStart + (r * (4 * stepSec)) / div;
            events.push(
              drumHit('hatClosed', t, 0.45, section.energy, preset.humanize, rng, stepSec),
            );
          }
        }
      }

      if (doFill) {
        events.push(...makeFill(barStart, barSec, beatSec, section.energy, preset.humanize, rng));
      }
    }
  }

  return events;
}

function laneEnabled(voice: VoiceId, energy: number): boolean {
  const index = LANE_PRIORITY.indexOf(voice);
  if (index < 0) return true;
  // エネルギーが高いほど多くのレーンが生き残る
  const threshold = 0.16 + index * 0.075;
  return energy >= threshold;
}

/**
 * スイングによる時刻のずれ。
 * swing は 0（ストレート）〜1（3 連符のハネ）。
 */
function swingOffset(step: number, stepSec: number, swing: number): number {
  if (swing <= 0) return 0;
  if (step % 4 === 2) return swing * stepSec * (2 / 3); // 8 分裏
  if (step % 2 === 1) return swing * stepSec * (1 / 3); // 16 分裏
  return 0;
}

function drumHit(
  voice: VoiceId,
  time: number,
  baseVel: number,
  energy: number,
  humanize: number,
  rng: Rng,
  stepSec: number,
): NoteEvent {
  const vel = Math.max(
    0.05,
    Math.min(1, baseVel * (0.45 + energy * 0.72) + jitter(rng, 0.06 * humanize)),
  );
  return {
    time: Math.max(0, time + jitter(rng, stepSec * 0.09 * humanize)),
    dur: voice === 'hatOpen' ? 0.28 : 0.12,
    freq: DRUM_FREQ[voice] ?? 0,
    vel,
    voice,
    role: 'drums',
    pan: voice === 'hatClosed' || voice === 'hatOpen' ? 0.18 : voice === 'tom' ? -0.2 : 0,
  };
}

/** セクション終わりのフィル。スネアとタムのロール */
function makeFill(
  barStart: number,
  barSec: number,
  beatSec: number,
  energy: number,
  humanize: number,
  rng: Rng,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  const div = pick(rng, [4, 6, 8]);
  const fillStart = barStart + barSec / 2;
  const fillLen = barSec / 2;
  for (let i = 0; i < div; i++) {
    const t = fillStart + (i * fillLen) / div;
    const useTom = chance(rng, 0.45);
    const vel = 0.45 + (i / div) * 0.45;
    out.push({
      time: Math.max(0, t + jitter(rng, 0.006 * humanize)),
      dur: 0.14,
      freq: useTom ? 160 - i * 12 : 190,
      vel: Math.min(1, vel * (0.7 + energy * 0.4)),
      voice: useTom ? 'tom' : 'snare',
      role: 'drums',
      pan: useTom ? -0.3 + (i / div) * 0.6 : 0,
    });
  }
  // フィル明けのクラッシュ代わりにオープンハット
  out.push({
    time: barStart + barSec - beatSec * 0.02,
    dur: 0.5,
    freq: 8000,
    vel: 0.5,
    voice: 'hatOpen',
    role: 'drums',
    pan: 0.1,
  });
  return out;
}
