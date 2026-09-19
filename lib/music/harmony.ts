/**
 * セクションにコード進行を割り当てる。
 *
 * 同じ種類のセクション（サビ同士など）には同じ進行を使い、
 * 繰り返しによるまとまりを出す。
 */

import type { ChordSlot, GenreId, ResolvedSpec, Section } from '@/lib/types';
import { chance, pick, type Rng } from '@/lib/random';
import type { GenrePreset } from './genres';
import { parseRoman, voiceChord } from './theory';
import { barSeconds, beatSeconds } from './structure';

/** 1 小節あたりのコード数。1 未満なら複数小節で 1 コード */
const HARMONIC_RHYTHM: Record<GenreId, number> = {
  lofi: 1,
  citypop: 1,
  edm: 1,
  rock: 1,
  ambient: 0.5,
  jazz: 1,
  trap: 1,
  cinematic: 0.5,
};

/** コードのルートを置くオクターブ（低すぎると濁る） */
const CHORD_ROOT_OCTAVE = 3;
/** ボイシングの中心。この付近に構成音を集める */
const VOICING_CENTER = 61;

function progressionFor(section: Section, preset: GenrePreset): 'chorus' | 'verse' | 'bridge' {
  switch (section.kind) {
    case 'chorus':
      return 'chorus';
    case 'bridge':
    case 'prechorus':
    case 'break':
      return preset.progressions.bridge.length > 0 ? 'bridge' : 'verse';
    default:
      return 'verse';
  }
}

export function planHarmony(
  sections: Section[],
  spec: ResolvedSpec,
  preset: GenrePreset,
  rng: Rng,
): void {
  // 進行は種類ごとに 1 本ずつ先に決めておく（同じサビは同じ進行になる）
  const chosen = {
    chorus: pick(rng, preset.progressions.chorus),
    verse: pick(rng, preset.progressions.verse),
    bridge: pick(rng, preset.progressions.bridge),
  };

  const barSec = barSeconds(spec.tempo);
  const beatSec = beatSeconds(spec.tempo);
  const rhythm = HARMONIC_RHYTHM[spec.genre];

  let prevVoicing: number[] | undefined;

  for (const section of sections) {
    const progression = chosen[progressionFor(section, preset)];
    const barsPerChord = rhythm >= 1 ? 1 / rhythm : Math.round(1 / rhythm);
    const slots: ChordSlot[] = [];

    let index = 0;
    for (let b = 0; b < section.bars; b += barsPerChord) {
      const remainingBars = Math.min(barsPerChord, section.bars - b);
      let roman = progression[index % progression.length];

      // セクション最後のコードは、たまに終止感のある形に差し替える
      const isLast = b + barsPerChord >= section.bars;
      if (isLast && chance(rng, 0.3)) {
        roman = embellish(roman, rng);
      }

      const parsed = parseRoman(roman, spec.key.root, CHORD_ROOT_OCTAVE);
      const pitches = voiceChord(
        parsed.rootMidi,
        parsed.intervals,
        VOICING_CENTER,
        prevVoicing,
      );
      prevVoicing = pitches;

      const absoluteBar = section.startBar + b;
      slots.push({
        bar: absoluteBar,
        beat: 0,
        beats: remainingBars * 4,
        roman,
        root: parsed.rootMidi,
        pitches,
        startSec: absoluteBar * barSec,
        durSec: remainingBars * 4 * beatSec,
      });
      index++;
    }

    section.chords = slots;
  }
}

/** 終止用にテンションを足す。既にサフィックスが付いていれば触らない */
function embellish(roman: string, rng: Rng): string {
  if (/[0-9]|M7|sus|add|dim|aug/.test(roman)) return roman;
  const isMinor = roman === roman.toLowerCase();
  const options = isMinor ? ['7', '9'] : ['M7', '7', 'sus4', '6'];
  return roman + pick(rng, options);
}
