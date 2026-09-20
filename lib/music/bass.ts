/**
 * ベースラインの生成。ジャンルごとに奏法を切り替える。
 */

import type { ChordSlot, NoteEvent, ResolvedSpec, Section } from '@/lib/types';
import { chance, jitter, pick, type Rng } from '@/lib/random';
import type { GenrePreset } from './genres';
import { beatSeconds } from './structure';
import { quantizeToScale } from './theory';

/** ベースが鳴る音域の目安（MIDI） */
const BASS_LOW = 31;
const BASS_HIGH = 50;

function toBassRegister(midi: number): number {
  let n = midi - 12;
  while (n > BASS_HIGH) n -= 12;
  while (n < BASS_LOW) n += 12;
  return n;
}

export function generateBass(
  sections: Section[],
  spec: ResolvedSpec,
  preset: GenrePreset,
  rng: Rng,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  const beatSec = beatSeconds(spec.tempo);
  const voice = preset.bassStyle === 'slide808' ? 'sub808' : 'bass';

  // 進行を跨いだ処理（ウォーキング）のため、全コードを平坦に並べておく
  const allChords: { chord: ChordSlot; section: Section }[] = [];
  for (const s of sections) {
    for (const c of s.chords) allChords.push({ chord: c, section: s });
  }

  for (let i = 0; i < allChords.length; i++) {
    const { chord, section } = allChords[i];
    if (!section.activeRoles.includes('bass')) continue;
    const next = allChords[i + 1]?.chord;

    const root = toBassRegister(chord.root);
    const nextRoot = next ? toBassRegister(next.root) : root;
    const vel = 0.34 + section.energy * 0.52;

    switch (preset.bassStyle) {
      case 'root':
        pushRoot(events, chord, root, beatSec, vel, voice, rng, preset.humanize);
        break;
      case 'driving':
        pushDriving(events, chord, root, beatSec, vel, voice, rng, preset.humanize);
        break;
      case 'octave':
        pushOctave(events, chord, root, beatSec, vel, voice, rng, preset.humanize, section.energy);
        break;
      case 'syncopated':
        pushSyncopated(events, chord, root, beatSec, vel, voice, rng, preset.humanize);
        break;
      case 'walking':
        pushWalking(events, chord, root, nextRoot, beatSec, vel, voice, rng, spec, preset.humanize);
        break;
      case 'slide808':
        pushSlide808(events, chord, root, beatSec, vel, rng, section.energy);
        break;
    }
  }

  return events;
}

type Voice = NoteEvent['voice'];

function note(
  time: number,
  dur: number,
  midi: number,
  vel: number,
  voice: Voice,
  glideFrom?: number,
): NoteEvent {
  return {
    time: Math.max(0, time),
    dur: Math.max(0.05, dur),
    freq: 440 * Math.pow(2, (midi - 69) / 12),
    vel: Math.max(0.05, Math.min(1, vel)),
    voice,
    role: 'bass',
    pan: 0,
    glideFrom:
      glideFrom === undefined ? undefined : 440 * Math.pow(2, (glideFrom - 69) / 12),
  };
}

function pushRoot(
  out: NoteEvent[],
  chord: ChordSlot,
  root: number,
  beatSec: number,
  vel: number,
  voice: Voice,
  rng: Rng,
  humanize: number,
) {
  const beats = chord.beats;
  for (let b = 0; b < beats; b += 2) {
    const t = chord.startSec + b * beatSec + jitter(rng, 0.008 * humanize);
    out.push(note(t, beatSec * 1.8, root, vel, voice));
  }
}

function pushDriving(
  out: NoteEvent[],
  chord: ChordSlot,
  root: number,
  beatSec: number,
  vel: number,
  voice: Voice,
  rng: Rng,
  humanize: number,
) {
  const steps = chord.beats * 2; // 8 分
  for (let s = 0; s < steps; s++) {
    const t = chord.startSec + s * (beatSec / 2) + jitter(rng, 0.005 * humanize);
    const v = s % 2 === 0 ? vel : vel * 0.78;
    out.push(note(t, beatSec * 0.42, root, v, voice));
  }
}

function pushOctave(
  out: NoteEvent[],
  chord: ChordSlot,
  root: number,
  beatSec: number,
  vel: number,
  voice: Voice,
  rng: Rng,
  humanize: number,
  energy: number,
) {
  const steps = chord.beats * 2;
  const fifth = root + 7;
  for (let s = 0; s < steps; s++) {
    // 8 分の裏を確率的に抜いてグルーヴを作る
    if (s % 2 === 1 && chance(rng, 0.35 - energy * 0.15)) continue;
    const t = chord.startSec + s * (beatSec / 2) + jitter(rng, 0.006 * humanize);
    let midi = root;
    if (s % 4 === 2) midi = root + 12;
    else if (s % 8 === 5) midi = fifth;
    const v = s % 2 === 0 ? vel : vel * 0.7;
    out.push(note(t, beatSec * 0.4, midi, v, voice));
  }
}

function pushSyncopated(
  out: NoteEvent[],
  chord: ChordSlot,
  root: number,
  beatSec: number,
  vel: number,
  voice: Voice,
  rng: Rng,
  humanize: number,
) {
  // 1 拍目 + 裏拍のゴーストで、ヒップホップ的な重さを出す
  const pattern = pick(rng, [
    [0, 1.5, 3],
    [0, 2.5],
    [0, 1.75, 3.5],
    [0, 1.5, 2.5, 3.5],
  ]);
  for (let bar = 0; bar < chord.beats / 4; bar++) {
    for (const p of pattern) {
      const t = chord.startSec + (bar * 4 + p) * beatSec + jitter(rng, 0.012 * humanize);
      const v = p === 0 ? vel : vel * 0.72;
      out.push(note(t, beatSec * (p === 0 ? 1.1 : 0.7), root, v, voice));
    }
  }
}

function pushWalking(
  out: NoteEvent[],
  chord: ChordSlot,
  root: number,
  nextRoot: number,
  beatSec: number,
  vel: number,
  voice: Voice,
  rng: Rng,
  spec: ResolvedSpec,
  humanize: number,
) {
  const beats = chord.beats;
  const tones = [root, root + 4, root + 7, root + 10].map((n) =>
    quantizeToScale(n, spec.key.root, spec.key.scale),
  );
  for (let b = 0; b < beats; b++) {
    const t = chord.startSec + b * beatSec + jitter(rng, 0.014 * humanize);
    let midi: number;
    if (b === 0) {
      midi = root;
    } else if (b === beats - 1) {
      // 次のコードのルートへ半音でアプローチ
      midi = nextRoot + (chance(rng, 0.5) ? -1 : 1);
    } else {
      midi = pick(rng, tones);
    }
    out.push(note(t, beatSec * 0.85, midi, vel * (b === 0 ? 1 : 0.85), voice));
  }
}

function pushSlide808(
  out: NoteEvent[],
  chord: ChordSlot,
  root: number,
  beatSec: number,
  vel: number,
  rng: Rng,
  energy: number,
) {
  const bars = Math.max(1, chord.beats / 4);
  for (let bar = 0; bar < bars; bar++) {
    const base = chord.startSec + bar * 4 * beatSec;
    // 1 拍目はロングトーン
    out.push(note(base, beatSec * 2.4, root, vel, 'sub808'));
    // 3 拍目あたりにスライドで入るショートノート
    if (chance(rng, 0.55 + energy * 0.25)) {
      const target = root + pick(rng, [0, 3, 5, 7, -5]);
      out.push(
        note(base + beatSec * 2.75, beatSec * 1.1, target, vel * 0.9, 'sub808', root),
      );
    }
  }
}
