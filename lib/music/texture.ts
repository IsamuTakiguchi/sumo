/**
 * 和音まわりのパート（パッド／バッキング／アルペジオ）の生成。
 * PartConfig.style で奏法を切り替える。
 */

import type { ChordSlot, NoteEvent, ResolvedSpec, Section } from '@/lib/types';
import { chance, jitter, pick, type Rng } from '@/lib/random';
import type { GenrePreset, PartConfig } from './genres';
import { beatSeconds } from './structure';
import { chordTonesForArp, midiToFreq } from './theory';

export function generateTexture(
  sections: Section[],
  spec: ResolvedSpec,
  preset: GenrePreset,
  part: PartConfig,
  rng: Rng,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  const beatSec = beatSeconds(spec.tempo);

  for (const section of sections) {
    if (!section.activeRoles.includes(part.role)) continue;
    if (section.energy < part.minEnergy) continue;

    for (const chord of section.chords) {
      const vel = (0.3 + section.energy * 0.62) * (0.75 + part.gain * 0.5);
      const style = part.style ?? 'sustain';
      switch (style) {
        case 'sustain':
          events.push(...sustain(chord, part, vel, beatSec));
          break;
        case 'stab':
          events.push(...stab(chord, part, vel, beatSec, rng, preset.humanize, section.energy));
          break;
        case 'broken':
          events.push(...broken(chord, part, vel, beatSec, rng, preset.humanize));
          break;
        case 'power':
          events.push(...power(chord, part, vel, beatSec, rng, preset.humanize));
          break;
        case 'arpUp':
        case 'arpUpDown':
        case 'arpRandom':
          events.push(
            ...arpeggio(chord, part, vel, beatSec, rng, preset.humanize, spec, style),
          );
          break;
      }
    }
  }

  return events;
}

function transpose(pitches: number[], part: PartConfig): number[] {
  // PartConfig.octave を基準に、ボイシング全体を移調する
  const center = 12 * (part.octave + 1);
  const avg = pitches.reduce((s, p) => s + p, 0) / pitches.length;
  const shift = Math.round((center - avg) / 12) * 12;
  return pitches.map((p) => p + shift);
}

function ev(
  time: number,
  dur: number,
  midi: number,
  vel: number,
  part: PartConfig,
  panJitter = 0,
): NoteEvent {
  return {
    time: Math.max(0, time),
    dur: Math.max(0.05, dur),
    freq: midiToFreq(midi),
    vel: Math.max(0.04, Math.min(1, vel)),
    voice: part.voice,
    role: part.role,
    pan: Math.max(-1, Math.min(1, part.pan + panJitter)),
  };
}

/** 和音をそのまま伸ばす（パッド／ストリングス） */
function sustain(
  chord: ChordSlot,
  part: PartConfig,
  vel: number,
  beatSec: number,
): NoteEvent[] {
  const pitches = transpose(chord.pitches, part);
  // アタックが遅い音色なので、コードの頭よりわずかに早く弾き始める
  const lead = beatSec * 0.12;
  return pitches.map((p, i) =>
    ev(chord.startSec - lead, chord.durSec + lead * 0.8, p, vel * (i === 0 ? 1 : 0.85), part, i * 0.04 - 0.06),
  );
}

/** オフビートの短い和音（シティポップ／ジャズのコンピング） */
function stab(
  chord: ChordSlot,
  part: PartConfig,
  vel: number,
  beatSec: number,
  rng: Rng,
  humanize: number,
  energy: number,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  const pitches = transpose(chord.pitches, part);
  const bars = Math.max(1, chord.beats / 4);
  for (let bar = 0; bar < bars; bar++) {
    const base = chord.startSec + bar * 4 * beatSec;
    const positions = pick(rng, [
      [0, 1.5, 2.5],
      [0.5, 1.5, 3],
      [0, 2, 3.5],
      [0.5, 2.5],
      [0, 1.5, 2.5, 3.5],
    ]);
    for (const p of positions) {
      if (p > 0 && chance(rng, 0.2 - energy * 0.1)) continue;
      const t = base + p * beatSec + jitter(rng, 0.012 * humanize);
      const dur = beatSec * (0.3 + part.density * 0.4);
      const v = vel * (p === 0 ? 1 : 0.82);
      pitches.forEach((m, i) => out.push(ev(t, dur, m, v * (1 - i * 0.05), part, i * 0.03 - 0.05)));
    }
  }
  return out;
}

/** 分散和音（エレピのバッキング、ピアノの左手） */
function broken(
  chord: ChordSlot,
  part: PartConfig,
  vel: number,
  beatSec: number,
  rng: Rng,
  humanize: number,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  const pitches = transpose(chord.pitches, part);
  const stepBeats = part.density > 0.5 ? 0.5 : 1;
  const steps = Math.floor(chord.beats / stepBeats);
  for (let s = 0; s < steps; s++) {
    if (chance(rng, 0.18)) continue;
    const t = chord.startSec + s * stepBeats * beatSec + jitter(rng, 0.014 * humanize);
    // 1 拍目は和音で、それ以外は単音でつなぐ
    if (s === 0) {
      pitches.forEach((m, i) =>
        out.push(ev(t, beatSec * 1.6, m, vel * (1 - i * 0.06), part, i * 0.03 - 0.04)),
      );
    } else {
      const m = pitches[s % pitches.length];
      out.push(ev(t, beatSec * stepBeats * 1.4, m, vel * 0.72, part, jitter(rng, 0.08)));
    }
  }
  return out;
}

/** パワーコード（ロックのギター） */
function power(
  chord: ChordSlot,
  part: PartConfig,
  vel: number,
  beatSec: number,
  rng: Rng,
  humanize: number,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  const root = 12 * (part.octave + 1) + (chord.root % 12);
  const steps = Math.floor(chord.beats * 2); // 8 分刻み
  for (let s = 0; s < steps; s++) {
    if (s % 2 === 1 && chance(rng, 0.25)) continue;
    const t = chord.startSec + s * (beatSec / 2) + jitter(rng, 0.008 * humanize);
    const v = vel * (s % 2 === 0 ? 1 : 0.78);
    out.push(ev(t, beatSec * 0.46, root, v, part));
    out.push(ev(t, beatSec * 0.46, root + 7, v * 0.9, part));
  }
  return out;
}

/** アルペジオ */
function arpeggio(
  chord: ChordSlot,
  part: PartConfig,
  vel: number,
  beatSec: number,
  rng: Rng,
  humanize: number,
  spec: ResolvedSpec,
  style: 'arpUp' | 'arpUpDown' | 'arpRandom',
): NoteEvent[] {
  const out: NoteEvent[] = [];
  const pitches = transpose(chord.pitches, part);
  const octaves = part.density > 0.6 ? 2 : 1;
  const tones = chordTonesForArp(pitches, octaves);

  const stepBeats = part.density > 0.65 ? 0.25 : part.density > 0.4 ? 0.5 : 1;
  const steps = Math.round(chord.beats / stepBeats);

  let order: number[];
  if (style === 'arpUp') order = tones;
  else if (style === 'arpUpDown') order = [...tones, ...tones.slice(1, -1).reverse()];
  else order = tones;

  for (let s = 0; s < steps; s++) {
    const skip = style === 'arpRandom' ? chance(rng, 0.45) : chance(rng, 0.08 * (1 - spec.density));
    if (skip) continue;
    const t = chord.startSec + s * stepBeats * beatSec + jitter(rng, 0.006 * humanize);
    const midi =
      style === 'arpRandom' ? pick(rng, tones) : order[s % order.length];
    const v = vel * (s % 4 === 0 ? 1 : 0.76);
    out.push(ev(t, beatSec * stepBeats * 1.6, midi, v, part, jitter(rng, 0.12)));
  }
  return out;
}
