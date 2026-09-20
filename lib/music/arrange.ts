/**
 * 編曲パイプラインの入口。
 *
 * GenerationRequest（ユーザーの指定）とシードから、音を持たない純粋なデータ
 * である Arrangement を組み立てる。ここまでは Web Audio API に一切触れない。
 */

import type {
  Arrangement,
  BusSpec,
  GenerationRequest,
  MoodId,
  NoteEvent,
  PitchClass,
  ResolvedSpec,
  ScaleId,
  VoiceId,
} from '@/lib/types';
import { busKeyOf } from '@/lib/types';
import { forkRng, jitter, randInt, weighted, type Rng } from '@/lib/random';
import { GENRE_PRESETS, type GenrePreset, type PartConfig } from './genres';
import { MOOD_MAP } from './moods';
import { analyzePrompt, type PromptHints } from './prompt';
import { planSections, barSeconds } from './structure';
import { planHarmony } from './harmony';
import { generateDrums } from './drums';
import { generateBass } from './bass';
import { generateTexture } from './texture';
import { generateMelody } from './melody';
import { generateLyrics, generateTitle, lyricsToText, type LyricSection } from './lyrics';
import { isMinorish } from './theory';

export interface ComposeResult {
  arrangement: Arrangement;
  hints: PromptHints;
  lyricSections: LyricSection[] | null;
  lyricsText: string | null;
}

function clamp01(v: number): number {
  return Math.max(0.05, Math.min(1, v));
}

export function resolveSpec(
  req: GenerationRequest,
  hints: PromptHints,
  seed: number,
): ResolvedSpec {
  const rng = forkRng(seed, 'spec');
  const preset = GENRE_PRESETS[req.genre];

  // UI で選ばれたムードを優先し、無ければプロンプトから推定したものを使う
  const moods: MoodId[] = req.moods.length > 0 ? req.moods : hints.moods;

  let energy = 0.5;
  let brightness = 0.5;
  let density = 0.5;
  let tempoBias = 0;
  let tonality = 0;
  for (const m of moods) {
    const def = MOOD_MAP[m];
    energy += def.energy * 0.5;
    brightness += def.brightness * 0.5;
    density += def.density * 0.5;
    tempoBias += def.tempo * 0.5;
    tonality += def.tonality;
  }
  if (moods.length > 0) tonality /= moods.length;

  // プロンプト由来のバイアスは弱めに足す（ムードと二重にかかりすぎないように）
  energy = clamp01(energy + hints.energyBias * 0.25);
  brightness = clamp01(brightness + hints.brightnessBias * 0.3);
  density = clamp01(density + hints.densityBias * 0.3);
  tempoBias = Math.max(-1, Math.min(1, tempoBias + hints.tempoBias * 0.3));

  const tempo = resolveTempo(req, hints, preset, tempoBias, rng);
  const key = resolveKey(req, preset, tonality, rng);

  return {
    seed,
    genre: req.genre,
    tempo,
    swing: Math.max(0, preset.swing + jitter(rng, 0.03)),
    key,
    bars: 0, // planSections のあとで埋める
    energy,
    brightness,
    density,
    vocal: req.vocal,
    moods,
  };
}

function resolveTempo(
  req: GenerationRequest,
  hints: PromptHints,
  preset: GenrePreset,
  tempoBias: number,
  rng: Rng,
): number {
  if (req.tempo !== null && Number.isFinite(req.tempo)) {
    return Math.round(Math.max(40, Math.min(220, req.tempo)));
  }
  if (hints.explicitTempo !== null) return hints.explicitTempo;

  const [lo, hi] = preset.tempo;
  const t = lo + (hi - lo) * (0.5 + tempoBias * 0.5) + jitter(rng, 2.5);
  return Math.round(Math.max(lo, Math.min(hi, t)));
}

function resolveKey(
  req: GenerationRequest,
  preset: GenrePreset,
  tonality: number,
  rng: Rng,
): { root: PitchClass; scale: ScaleId } {
  if (req.key) return req.key;

  // 明るいムードならメジャー系、暗いムードならマイナー系に重みを寄せる
  const weights = preset.scales.map(([scale, w]) => {
    const factor = isMinorish(scale) ? 1 - tonality * 0.8 : 1 + tonality * 0.8;
    return [scale, Math.max(0.05, w * factor)] as const;
  });
  const scale = weighted(rng, weights);

  // 歌いやすさと合成音の鳴りを考えて、極端に高い／低いキーは避ける
  const roots: PitchClass[] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10];
  const root = roots[randInt(rng, 0, roots.length - 1)];
  return { root, scale };
}

/**
 * ユーザーが「入れたい楽器」を指定した場合、プリセットに無ければパートを足す。
 * すでに同じ音色が鳴っているならゲインを少し上げるだけにする。
 */
function withRequestedInstruments(parts: PartConfig[], instruments: VoiceId[]): PartConfig[] {
  const out = parts.map((p) => ({ ...p }));
  for (const voice of instruments) {
    const existing = out.find((p) => p.voice === voice);
    if (existing) {
      existing.gain = Math.min(0.55, existing.gain * 1.25);
      continue;
    }
    out.push(extraPartFor(voice));
  }
  return out;
}

function extraPartFor(voice: VoiceId): PartConfig {
  const base: PartConfig = {
    role: 'texture',
    voice,
    gain: 0.22,
    pan: 0.22,
    octave: 4,
    density: 0.4,
    reverbSend: 0.32,
    delaySend: 0.14,
    minEnergy: 0.3,
    style: 'sustain',
  };
  switch (voice) {
    case 'piano':
    case 'epiano':
      return { ...base, style: 'broken', density: 0.5, octave: 4 };
    case 'guitar':
      return { ...base, style: 'power', octave: 3, pan: -0.35, density: 0.6 };
    case 'pluck':
    case 'bell':
      return { ...base, role: 'arp', style: 'arpUpDown', octave: 5, density: 0.7, delaySend: 0.32 };
    case 'lead':
      return { ...base, role: 'lead', octave: 5, density: 0.55, minEnergy: 0.5 };
    case 'strings':
    case 'pad':
    default:
      return { ...base, style: 'sustain', octave: 3, density: 0.2, reverbSend: 0.45 };
  }
}

/**
 * ドラム各音の基本ミックス設定。ジャンルごとの `preset.mix.drums` で全体を上下させる。
 * drive はそのチャンネル全体に掛かる飽和量（音量は変えず波形だけ丸める）。
 *
 * 打楽器の音色は vel=1 でピーク 1.0 に揃えてあるので（lib/audio/voices.ts の LEVEL）、
 * ここの gain がそのままキットの中のバランスになる。
 */
const DRUM_MIX: Record<string, { gain: number; pan: number; reverb: number; drive?: number }> = {
  kick: { gain: 0.55, pan: 0, reverb: 0.04, drive: 0.25 },
  snare: { gain: 0.34, pan: 0, reverb: 0.3 },
  clap: { gain: 0.32, pan: 0, reverb: 0.34 },
  hatClosed: { gain: 0.17, pan: 0.18, reverb: 0.1 },
  hatOpen: { gain: 0.16, pan: 0.2, reverb: 0.22 },
  tom: { gain: 0.3, pan: -0.15, reverb: 0.28 },
  ride: { gain: 0.18, pan: 0.22, reverb: 0.24 },
};

/**
 * 音色ごとの、チャンネル単位で掛けるエフェクト量。
 * ベースの drive はジャンルごとに変えたいので `preset.mix.bassDrive` に移した。
 */
const VOICE_FX: Partial<Record<VoiceId, { drive?: number; chorus?: number }>> = {
  guitar: { drive: 0.6 },
  pad: { chorus: 1 },
  strings: { chorus: 0.6 },
};

/**
 * センド量の全体スケール。
 *
 * 以前は `part.reverbSend * (0.5 + preset.reverb.mix)` のように下駄を履かせていたため、
 * プリセットで 0.06〜0.60（10 倍）振ったリバーブ量が実効 1.67 倍まで圧縮され、
 * ジャンルごとの空間の違いがほとんど出ていなかった。素直な掛け算に戻し、
 * 全体量だけをここで合わせる。
 */
const SEND_SCALE = 2;

/** 楽譜に出てくる音色から、ミキサーのチャンネル一覧を組み立てる */
function buildBuses(
  events: NoteEvent[],
  parts: PartConfig[],
  preset: GenrePreset,
): BusSpec[] {
  const buses = new Map<string, BusSpec>();

  for (const part of parts) {
    const key = `${part.role}:${part.voice}`;
    if (buses.has(key)) continue;
    buses.set(key, {
      key,
      role: part.role,
      voice: part.voice,
      gain: part.gain,
      pan: part.pan,
      reverbSend: part.reverbSend * preset.reverb.mix * SEND_SCALE,
      delaySend: part.delaySend * preset.delay.mix * SEND_SCALE,
      ...VOICE_FX[part.voice],
    });
  }

  // ドラムとベースはプリセットの parts に含まれないので、実際に鳴っている音から作る
  for (const ev of events) {
    const key = busKeyOf(ev);
    if (buses.has(key)) continue;
    if (ev.role === 'drums') {
      const mix = DRUM_MIX[ev.voice] ?? { gain: 0.5, pan: 0, reverb: 0.2 };
      buses.set(key, {
        key,
        role: 'drums',
        voice: ev.voice,
        gain: mix.gain * preset.mix.drums,
        pan: mix.pan,
        reverbSend: mix.reverb * preset.reverb.mix * SEND_SCALE,
        delaySend: 0,
        drive: mix.drive,
      });
    } else if (ev.role === 'bass') {
      buses.set(key, {
        key,
        role: 'bass',
        voice: ev.voice,
        gain: preset.mix.bass,
        pan: 0,
        // ベースは前に出したいのでほぼドライ。それでもジャンルの空間には少しだけ乗せる
        reverbSend: 0.06 * preset.reverb.mix * SEND_SCALE,
        delaySend: 0,
        drive: preset.mix.bassDrive,
      });
    } else {
      buses.set(key, {
        key,
        role: ev.role,
        voice: ev.voice,
        gain: 0.25,
        pan: ev.pan ?? 0,
        reverbSend: 0.25 * preset.reverb.mix * SEND_SCALE,
        delaySend: 0.1 * preset.delay.mix * SEND_SCALE,
        ...VOICE_FX[ev.voice],
      });
    }
  }

  return Array.from(buses.values());
}

export function composeArrangement(req: GenerationRequest, seed: number): ComposeResult {
  const hints = analyzePrompt(req.prompt);
  const preset = GENRE_PRESETS[req.genre];
  const spec = resolveSpec(req, hints, seed);

  const sections = planSections(
    spec,
    preset,
    forkRng(seed, 'structure'),
    req.durationSec,
  );
  spec.bars = sections.reduce((s, x) => s + x.bars, 0);

  planHarmony(sections, spec, preset, forkRng(seed, 'harmony'));

  const parts = withRequestedInstruments(preset.parts, req.instruments);

  const events: NoteEvent[] = [];
  events.push(...generateDrums(sections, spec, preset, forkRng(seed, 'drums')));
  events.push(...generateBass(sections, spec, preset, forkRng(seed, 'bass')));

  parts.forEach((part, index) => {
    // パートごとに独立した乱数ストリームを使う（他パートの変更に影響されない）
    const rng = forkRng(seed, `part:${index}:${part.voice}:${part.role}`);
    if (part.role === 'lead') {
      events.push(...generateMelody(sections, spec, preset, part, rng));
    } else {
      events.push(...generateTexture(sections, spec, preset, part, rng));
    }
  });

  const barSec = barSeconds(spec.tempo);
  const totalSec = spec.bars * barSec;

  // ジャンル固有の環境音（ローファイのレコードノイズなど）を曲全体に薄く敷く
  if (preset.ambience) {
    events.push({
      time: 0,
      dur: totalSec + 1,
      freq: 0,
      vel: 0.05,
      voice: preset.ambience,
      role: 'texture',
      pan: 0,
    });
  }

  events.sort((a, b) => a.time - b.time);

  const titleRng = forkRng(seed, 'title');
  const title = generateTitle(hints, spec.moods, titleRng, spec.vocal === 'instrumental');

  let lyricSections: LyricSection[] | null = null;
  let lyricsText: string | null = null;
  if (req.vocal === 'lyrics') {
    if (req.lyrics && req.lyrics.trim() !== '') {
      lyricsText = req.lyrics;
    } else {
      lyricSections = generateLyrics(hints, spec.moods, sections, forkRng(seed, 'lyrics'));
      lyricsText = lyricsToText(lyricSections);
    }
  }

  const arrangement: Arrangement = {
    spec,
    sections,
    events,
    buses: buildBuses(events, parts, preset),
    totalSec,
    title,
  };

  return { arrangement, hints, lyricSections, lyricsText };
}
