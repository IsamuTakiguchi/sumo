import type { MoodId, VoiceId } from '@/lib/types';

export interface MoodDef {
  id: MoodId;
  labelJa: string;
  /** -1..+1 各パラメータへの補正 */
  energy: number;
  brightness: number;
  density: number;
  tempo: number;
  /** マイナー寄り（-1）かメジャー寄り（+1）か */
  tonality: number;
}

export const MOODS: MoodDef[] = [
  { id: 'happy', labelJa: '明るい', energy: 0.25, brightness: 0.4, density: 0.15, tempo: 0.15, tonality: 0.8 },
  { id: 'sad', labelJa: '切ない', energy: -0.25, brightness: -0.35, density: -0.15, tempo: -0.2, tonality: -0.9 },
  { id: 'chill', labelJa: '落ち着く', energy: -0.35, brightness: -0.1, density: -0.3, tempo: -0.3, tonality: 0.1 },
  { id: 'energetic', labelJa: '疾走感', energy: 0.5, brightness: 0.25, density: 0.4, tempo: 0.35, tonality: 0.2 },
  { id: 'dreamy', labelJa: '幻想的', energy: -0.2, brightness: 0.15, density: -0.2, tempo: -0.15, tonality: 0.3 },
  { id: 'dark', labelJa: 'ダーク', energy: 0.1, brightness: -0.5, density: -0.05, tempo: -0.05, tonality: -0.9 },
  { id: 'epic', labelJa: '壮大', energy: 0.4, brightness: 0.05, density: 0.2, tempo: -0.05, tonality: -0.3 },
  { id: 'romantic', labelJa: 'ロマンチック', energy: -0.1, brightness: 0.2, density: -0.05, tempo: -0.1, tonality: 0.5 },
  { id: 'nostalgic', labelJa: 'ノスタルジック', energy: -0.15, brightness: -0.2, density: -0.1, tempo: -0.15, tonality: -0.2 },
];

export const MOOD_MAP: Record<MoodId, MoodDef> = Object.fromEntries(
  MOODS.map((m) => [m.id, m]),
) as Record<MoodId, MoodDef>;

export interface InstrumentDef {
  id: VoiceId;
  labelJa: string;
}

/** UI で「入れたい楽器」として選べるもの */
export const INSTRUMENT_TAGS: InstrumentDef[] = [
  { id: 'piano', labelJa: 'ピアノ' },
  { id: 'epiano', labelJa: 'エレピ' },
  { id: 'guitar', labelJa: 'ギター' },
  { id: 'strings', labelJa: 'ストリングス' },
  { id: 'pad', labelJa: 'シンセパッド' },
  { id: 'lead', labelJa: 'シンセリード' },
  { id: 'pluck', labelJa: 'プラック' },
  { id: 'bell', labelJa: 'ベル' },
];
