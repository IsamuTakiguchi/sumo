/**
 * Arrangement（楽譜データ）を音声に書き出す。
 *
 * ミックスの流れ:
 *   音色ごとのバス（ステレオ）
 *     → ドライブ → コーラス
 *     → ドラム以外はサイドチェインのダッキングを通してマスターへ
 *     ↘ リバーブ送り（モノラル）┐
 *     ↘ ディレイ送り（モノラル）┘→ ステレオで戻してマスターへ
 *   マスター → HPF/LPF → ドライブ → 直流カット → コンプレッサー
 *            → 音量合わせ（RMS）→ リミッタ → ピーク上限
 *
 * バスは `${role}:${voice}` 単位なので、ドライブやコーラスをバスで掛けても
 * 音符ごとに掛けるのとほぼ同じ音になり、処理量だけが大幅に減る。
 */

import type { Arrangement, BusSpec, NoteEvent } from '@/lib/types';
import { busKeyOf } from '@/lib/types';
import { forkRng } from '@/lib/random';
import { GENRE_PRESETS } from '@/lib/music/genres';
import { beatSeconds } from '@/lib/music/structure';
import { addToStereo, createStereo, type StereoBuffer } from './dsp';
import {
  applyChorus,
  applyCompressor,
  applyDelay,
  applyDrive,
  applyOnePoleHighpass,
  applyOnePoleLowpass,
  applyPeakCeiling,
  applyReverb,
  normalizeLoudness,
} from './effects';
import { VOICES, type VoiceContext } from './voices';

export interface RenderOptions {
  sampleRate?: number;
  /** 0..1 */
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
  /**
   * マスター段（EQ・ドライブ・コンプ・音量合わせ）を通さずに返す。
   * パートごとの寄与を測るときに使う。音量合わせが掛かると、
   * どのパートを抜き出しても同じ音量に揃ってしまい比較にならないため。
   */
  skipMaster?: boolean;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function renderArrangement(
  arrangement: Arrangement,
  options: RenderOptions = {},
): Promise<StereoBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const preset = GENRE_PRESETS[arrangement.spec.genre];

  // リバーブとリリースの残響ぶんだけ長めに確保する
  const tail = preset.reverb.seconds + 1.5;
  const length = Math.ceil((arrangement.totalSec + tail) * sampleRate);

  const master = createStereo(length, sampleRate);
  const reverbSend = new Float32Array(length);
  const delaySend = new Float32Array(length);

  // バス 1 本ぶんの作業領域と、音符 1 つぶんの作業領域を使い回す
  const busBuffer = createStereo(length, sampleRate);
  const noteBuffer = new Float32Array(length);

  const duck = buildDuckEnvelope(arrangement, preset.sidechain, length, sampleRate);

  const vc: VoiceContext = {
    sampleRate,
    spec: arrangement.spec,
    rng: forkRng(arrangement.spec.seed, 'noise'),
  };

  const byBus = groupByBus(arrangement.events);
  const buses = arrangement.buses;
  options.onProgress?.(0.02);

  for (let b = 0; b < buses.length; b++) {
    if (options.signal?.aborted) throw new DOMException('中止されました', 'AbortError');
    const spec = buses[b];
    const events = byBus.get(spec.key);
    if (events && events.length > 0) {
      renderBus(spec, events, busBuffer, noteBuffer, vc);
      mixBusIntoMaster(spec, busBuffer, master, reverbSend, delaySend, duck);
    }
    options.onProgress?.(0.02 + ((b + 1) / buses.length) * 0.78);
    await yieldToMain();
  }

  applyReverb(reverbSend, master, preset.reverb.seconds, preset.reverb.decay, 0.9);
  options.onProgress?.(0.88);
  await yieldToMain();

  const delaySec = Math.min(2.4, beatSeconds(arrangement.spec.tempo) * preset.delay.noteDiv * 2);
  applyDelay(delaySend, master, delaySec, preset.delay.feedback, 0.9);
  options.onProgress?.(0.93);
  await yieldToMain();

  if (options.skipMaster) {
    options.onProgress?.(1);
    return master;
  }

  if (preset.master.highpass) applyOnePoleHighpass(master, preset.master.highpass);
  if (preset.master.lowpass) applyOnePoleLowpass(master, preset.master.lowpass);
  if (preset.master.drive) applyDrive(master, preset.master.drive);

  // ドライブは左右非対称な波形（キックなど）から直流成分を生むので、その直後に落とす。
  // コンプより前に置くのが要点で、直流が残ったままだと検出器が「大きい信号」と誤認し、
  // 低音由来のゲインリダクションが増えてしまう。
  applyOnePoleHighpass(master, 18);

  // 検出側に 140Hz のハイパスを入れる（サイドチェイン HPF）。
  // これが無いとコンプはキックとベースのピークにしか反応せず、
  // 低音が鳴るたびに曲全体が沈んで旋律が周期的に埋もれる。
  // リリースも短くして、キック 1 発ごとのポンピングを残さない。
  applyCompressor(master, 0.6, 2, 0.01, 0.08, 140);

  // 体感音量（RMS）で揃える。ピーク基準だと、キックとベースが重なった一瞬が
  // 曲全体の音量を決めてしまい、ベースを下げない限り他のパートが大きくならない。
  normalizeLoudness(master, 0.16);
  // RMS で合わせたぶん飛び出すピークを受け止める
  applyCompressor(master, 0.85, 12, 0.002, 0.05);
  // ここでピークに合わせて上げ直すと音量合わせが台無しになるので、超過分を下げるだけ
  applyPeakCeiling(master, 0.95);

  options.onProgress?.(1);
  return master;
}

function groupByBus(events: NoteEvent[]): Map<string, NoteEvent[]> {
  const map = new Map<string, NoteEvent[]>();
  for (const ev of events) {
    const key = busKeyOf(ev);
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }
  return map;
}

/** 1 本のバスに属する音符をすべて合成し、バス用エフェクトを掛ける */
function renderBus(
  spec: BusSpec,
  events: NoteEvent[],
  busBuffer: StereoBuffer,
  noteBuffer: Float32Array,
  vc: VoiceContext,
): void {
  busBuffer.left.fill(0);
  busBuffer.right.fill(0);

  const renderer = VOICES[spec.voice];
  if (!renderer) return;

  for (const ev of events) {
    const offset = Math.round(ev.time * vc.sampleRate);
    if (offset >= busBuffer.length) continue;
    const written = renderer(noteBuffer, ev, vc);
    addToStereo(busBuffer, noteBuffer, written, offset, 1, ev.pan ?? spec.pan);
  }

  if (spec.drive && spec.drive > 0) applyDrive(busBuffer, spec.drive);
  if (spec.chorus && spec.chorus > 0) applyChorus(busBuffer, spec.chorus);
}

/** バスをマスターとセンドへ流し込む */
function mixBusIntoMaster(
  spec: BusSpec,
  busBuffer: StereoBuffer,
  master: StereoBuffer,
  reverbSend: Float32Array,
  delaySend: Float32Array,
  duck: Float32Array | null,
): void {
  const gain = spec.gain;
  // ドラムはダッキングを受けない（キック自身が原因なので）
  const ducked = duck !== null && spec.role !== 'drums';
  const reverbGain = spec.reverbSend * gain * 0.5;
  const delayGain = spec.delaySend * gain * 0.5;

  for (let i = 0; i < master.length; i++) {
    const g = ducked ? gain * duck[i] : gain;
    const l = busBuffer.left[i] * g;
    const r = busBuffer.right[i] * g;
    master.left[i] += l;
    master.right[i] += r;
    if (reverbGain > 0 || delayGain > 0) {
      const mono = (busBuffer.left[i] + busBuffer.right[i]) * 0.5;
      if (reverbGain > 0) reverbSend[i] += mono * reverbGain;
      if (delayGain > 0) delaySend[i] += mono * delayGain;
    }
  }
}

/**
 * キックのタイミングに合わせて音量を一瞬下げるカーブ（サイドチェイン）。
 * EDM やトラップの「ウネり」はこれで生まれる。
 */
function buildDuckEnvelope(
  arrangement: Arrangement,
  amount: number,
  length: number,
  sampleRate: number,
): Float32Array | null {
  if (amount <= 0) return null;
  const env = new Float32Array(length).fill(1);
  const recover = Math.max(1, Math.floor(0.18 * sampleRate));

  for (const ev of arrangement.events) {
    if (ev.voice !== 'kick') continue;
    const start = Math.round(ev.time * sampleRate);
    const depth = Math.max(0.05, 1 - amount * ev.vel);
    for (let i = 0; i < recover; i++) {
      const at = start + i;
      if (at < 0) continue;
      if (at >= length) break;
      const v = depth + (1 - depth) * (i / recover);
      if (v < env[at]) env[at] = v;
    }
  }
  return env;
}

/** 音が出ているかの簡易チェック（無音の曲を検出する） */
export function bufferRms(buffer: StereoBuffer): number {
  const stride = Math.max(1, Math.floor(buffer.length / 20000));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < buffer.length; i += stride) {
    const v = (buffer.left[i] + buffer.right[i]) * 0.5;
    sum += v * v;
    count++;
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}
