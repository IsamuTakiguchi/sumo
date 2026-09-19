/**
 * 主旋律の生成。
 *
 * ランダムな音の羅列にならないよう、4 つのルールを重ねている。
 *  1. 強拍は必ずコードトーンに着地させる
 *  2. 跳躍（4 半音超）の直後は必ず反対方向へ順次進行で戻す
 *  3. セクション内で「上昇 → 頂点 → 下降」のアーチを描く
 *  4. 2 小節のモチーフを作り、繰り返し・変奏する
 */

import type { ChordSlot, NoteEvent, ResolvedSpec, Section, SectionKind } from '@/lib/types';
import { chance, jitter, weighted, type Rng } from '@/lib/random';
import type { GenrePreset, PartConfig } from './genres';
import { beatSeconds } from './structure';
import {
  SCALE_STEPS,
  degreeToMidi,
  midiToFreq,
  nearestChordTone,
  quantizeToScale,
} from './theory';

/** 1 小節ぶんのリズム（単位: 拍）。合計は必ず 4 */
const RHYTHM_CELLS: [number[], number][] = [
  [[1, 1, 2], 4],
  [[2, 2], 3],
  [[1, 1, 1, 1], 3],
  [[0.5, 0.5, 1, 2], 3],
  [[1.5, 0.5, 2], 3],
  [[2, 1, 1], 3],
  [[1, 0.5, 0.5, 2], 2],
  [[0.5, 0.5, 0.5, 0.5, 2], 2],
  [[3, 1], 2],
  [[4], 2],
  [[1.5, 1.5, 1], 1],
];

interface Motif {
  /** 2 小節ぶんのリズム */
  rhythm: number[][];
  /** 音程の差分（スケール度数単位） */
  deltas: number[];
}

export function generateMelody(
  sections: Section[],
  spec: ResolvedSpec,
  preset: GenrePreset,
  part: PartConfig,
  rng: Rng,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  const beatSec = beatSeconds(spec.tempo);
  const baseCenter = 12 * (part.octave + 1) + spec.key.root;

  // セクション種別ごとにモチーフを 1 つ持ち、同じ種別では使い回す
  const motifs = new Map<SectionKind, Motif>();

  for (const section of sections) {
    if (!section.activeRoles.includes('lead')) continue;
    if (section.chords.length === 0) continue;

    let motif = motifs.get(section.kind);
    if (!motif) {
      motif = makeMotif(rng, spec.density + part.density * 0.5);
      motifs.set(section.kind, motif);
    }

    // サビは他より高い音域にして、盛り上がりを音高でも表現する
    const lift = section.kind === 'chorus' ? 4 : section.kind === 'prechorus' ? 2 : 0;
    const restRatio = Math.max(0.05, 0.42 - part.density * 0.3 - section.energy * 0.12);

    let prevMidi = baseCenter + lift;
    let lastLeap = 0;

    const phraseCount = Math.ceil(section.bars / 2);
    for (let phrase = 0; phrase < phraseCount; phrase++) {
      const barIndex = phrase * 2;
      const reuse = chance(rng, 0.62);
      const rhythm = reuse
        ? motif.rhythm
        : [weighted(rng, RHYTHM_CELLS), weighted(rng, RHYTHM_CELLS)];

      // アーチ：セクションの 65% 地点が頂点
      const pos = phraseCount > 1 ? phrase / (phraseCount - 1) : 0.5;
      const arch = Math.sin(Math.min(1, pos / 0.65) * Math.PI * 0.5) * 3 - (pos > 0.65 ? (pos - 0.65) * 6 : 0);
      const center = baseCenter + lift + arch;

      let noteIndex = 0;
      for (let localBar = 0; localBar < 2; localBar++) {
        const absBar = section.startBar + barIndex + localBar;
        if (barIndex + localBar >= section.bars) break;

        let beatInBar = 0;
        for (const len of rhythm[localBar]) {
          const timeSec = (absBar - section.startBar) * 4 * beatSec + beatInBar * beatSec + section.startSec;
          const chord = chordAtTime(section.chords, timeSec);
          const isStrong = beatInBar % 2 === 0;
          const isPhraseEnd =
            localBar === 1 && beatInBar + len >= 4;

          // 息継ぎ：フレーズ末と、確率的な休符
          const rest =
            (isPhraseEnd && chance(rng, 0.45)) || (!isStrong && chance(rng, restRatio));

          if (!rest && chord) {
            const delta = reuse
              ? motif.deltas[noteIndex % motif.deltas.length]
              : nextDelta(rng, lastLeap);
            let midi = applyDelta(prevMidi, delta, spec, center);

            if (isStrong) midi = nearestChordTone(midi, chord.pitches);
            else midi = quantizeToScale(midi, spec.key.root, spec.key.scale);

            // 音域から外れたらオクターブで折り返す
            while (midi > center + 10) midi -= 12;
            while (midi < center - 8) midi += 12;

            lastLeap = midi - prevMidi;
            prevMidi = midi;

            const vel =
              (0.4 + section.energy * 0.6) * (isStrong ? 1 : 0.82) + jitter(rng, 0.05);
            events.push({
              time: Math.max(0, timeSec + jitter(rng, 0.01 * preset.humanize)),
              dur: Math.max(0.08, len * beatSec * (isPhraseEnd ? 0.72 : 0.94)),
              freq: midiToFreq(midi),
              vel: Math.max(0.08, Math.min(1, vel)),
              voice: part.voice,
              role: 'lead',
              pan: part.pan,
            });
          }

          beatInBar += len;
          noteIndex++;
        }
      }
    }
  }

  return events;
}

function makeMotif(rng: Rng, density: number): Motif {
  const rhythm = [weighted(rng, RHYTHM_CELLS), weighted(rng, RHYTHM_CELLS)];
  const count = rhythm[0].length + rhythm[1].length;
  const deltas: number[] = [];
  let lastLeap = 0;
  for (let i = 0; i < count; i++) {
    const d = nextDelta(rng, lastLeap, density);
    deltas.push(d);
    lastLeap = d;
  }
  return { rhythm, deltas };
}

/**
 * 次の音程差（スケール度数）。
 * 直前が跳躍なら、必ず反対方向の順次進行で埋め合わせる。
 */
function nextDelta(rng: Rng, lastLeap: number, density = 0.5): number {
  if (Math.abs(lastLeap) > 2) {
    return lastLeap > 0 ? -1 : 1;
  }
  return weighted(rng, [
    [0, 1.2],
    [1, 3.4],
    [-1, 3.4],
    [2, 1.6],
    [-2, 1.5],
    [3, 0.7 + density * 0.4],
    [-3, 0.6],
    [4, 0.35],
    [-4, 0.3],
  ]);
}

/** スケール度数の差分を MIDI ノートに反映する */
function applyDelta(
  prevMidi: number,
  delta: number,
  spec: ResolvedSpec,
  center: number,
): number {
  if (delta === 0) return prevMidi;
  // 現在の音がスケール上の何番目かを求め、そこから度数で動かす
  const approxDegree = degreeIndexOf(prevMidi, spec);
  const target = degreeToMidi(
    spec.key.root,
    spec.key.scale,
    approxDegree + delta,
    Math.floor(center / 12) - 1,
  );
  // 同じピッチクラスでいちばん近いオクターブを選ぶ
  let midi = target;
  while (midi - prevMidi > 8) midi -= 12;
  while (prevMidi - midi > 8) midi += 12;
  return midi;
}

/** MIDI ノートが、キー上の何番目のスケール構成音かを求める */
function degreeIndexOf(midi: number, spec: ResolvedSpec): number {
  const steps = SCALE_STEPS[spec.key.scale];
  const q = quantizeToScale(midi, spec.key.root, spec.key.scale);
  const rel = q - spec.key.root;
  const octave = Math.floor(rel / 12);
  const within = ((rel % 12) + 12) % 12;
  const idx = Math.max(0, steps.indexOf(within));
  return idx + octave * steps.length;
}

/** 指定時刻に鳴っているコードを返す。範囲外なら最後のコード */
export function chordAtTime(chords: ChordSlot[], timeSec: number): ChordSlot | null {
  for (const c of chords) {
    if (timeSec >= c.startSec - 1e-6 && timeSec < c.startSec + c.durSec) return c;
  }
  return chords.length > 0 ? chords[chords.length - 1] : null;
}
