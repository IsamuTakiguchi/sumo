import type { GenreId, PartRole, ScaleId, SectionKind, VoiceId } from '@/lib/types';

/** ひとつの楽器パートの鳴らし方 */
export interface PartConfig {
  role: PartRole;
  voice: VoiceId;
  /** 0..1 */
  gain: number;
  /** -1..1 */
  pan: number;
  /** 基準オクターブ（4 で中央付近） */
  octave: number;
  /** 0..1 音符の詰まり具合 */
  density: number;
  reverbSend: number;
  delaySend: number;
  /** セクションのエネルギーがこの値未満なら鳴らさない */
  minEnergy: number;
  /** harmony 系パートの奏法 */
  style?: 'sustain' | 'stab' | 'broken' | 'arpUp' | 'arpUpDown' | 'arpRandom' | 'power';
}

export interface GenrePreset {
  id: GenreId;
  labelJa: string;
  labelEn: string;
  descJa: string;
  tempo: [number, number];
  swing: number;
  /** [スケール, 重み] */
  scales: [ScaleId, number][];
  progressions: {
    chorus: string[][];
    verse: string[][];
    bridge: string[][];
  };
  sectionTemplate: SectionKind[];
  drumPatterns: string[];
  parts: PartConfig[];
  reverb: { seconds: number; decay: number; mix: number };
  delay: { noteDiv: number; feedback: number; mix: number };
  /** 0..1 キックに合わせたダッキングの深さ */
  sidechain: number;
  master: { lowpass?: number; highpass?: number; drive?: number };
  /** 0..1 タイミングとベロシティの揺らぎ */
  humanize: number;
  /** ベースの奏法 */
  bassStyle: 'root' | 'octave' | 'walking' | 'slide808' | 'syncopated' | 'driving';
  /** 曲全体に薄く乗せる環境音 */
  ambience?: VoiceId;
}

export const GENRE_PRESETS: Record<GenreId, GenrePreset> = {
  lofi: {
    id: 'lofi',
    labelJa: 'ローファイ・ヒップホップ',
    labelEn: 'Lo-Fi Hip Hop',
    descJa: 'よれたドラムと温かいエレピ。作業用・勉強用に。',
    tempo: [70, 86],
    swing: 0.58,
    scales: [
      ['dorian', 3],
      ['minor', 3],
      ['major', 2],
      ['majorPentatonic', 1],
    ],
    progressions: {
      chorus: [
        ['ii7', 'V7', 'IM7', 'VIM7'],
        ['IM7', 'vi7', 'ii7', 'V7'],
        ['i7', 'iv7', 'bVII', 'bIII'],
      ],
      verse: [
        ['IM7', 'iii7', 'vi7', 'IV'],
        ['i7', 'bVII', 'bVI', 'V7'],
        ['ii7', 'V7', 'iii7', 'vi7'],
      ],
      bridge: [
        ['IV', 'V7', 'iii7', 'vi7'],
        ['bVI', 'bVII', 'i7', 'i7'],
      ],
    },
    sectionTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    drumPatterns: ['boombap', 'laidback'],
    parts: [
      { role: 'harmony', voice: 'epiano', gain: 0.5, pan: -0.12, octave: 4, density: 0.45, reverbSend: 0.26, delaySend: 0.14, minEnergy: 0.0, style: 'broken' },
      { role: 'texture', voice: 'pad', gain: 0.22, pan: 0.15, octave: 3, density: 0.2, reverbSend: 0.45, delaySend: 0.08, minEnergy: 0.2, style: 'sustain' },
      { role: 'lead', voice: 'bell', gain: 0.24, pan: 0.2, octave: 5, density: 0.4, reverbSend: 0.35, delaySend: 0.3, minEnergy: 0.55 },
    ],
    reverb: { seconds: 2.2, decay: 2.6, mix: 0.3 },
    delay: { noteDiv: 0.75, feedback: 0.32, mix: 0.22 },
    sidechain: 0.12,
    master: { lowpass: 7200, drive: 0.15 },
    humanize: 0.9,
    bassStyle: 'syncopated',
    ambience: 'vinyl',
  },

  citypop: {
    id: 'citypop',
    labelJa: 'シティポップ',
    labelEn: 'City Pop',
    descJa: '煌めくエレピと 16 ビート。夜のドライブに。',
    tempo: [100, 116],
    swing: 0.06,
    scales: [
      ['major', 4],
      ['mixolydian', 2],
      ['dorian', 1],
    ],
    progressions: {
      chorus: [
        ['IVM7', 'V7', 'iii7', 'vi7'],
        ['IVM7', 'V7', 'IM7', 'vi7'],
        ['vi7', 'V7', 'IVM7', 'IM7'],
      ],
      verse: [
        ['IM7', 'vi7', 'ii7', 'V7'],
        ['IVM7', 'iii7', 'vi7', 'ii7'],
        ['IM7', 'IVM7', 'iii7', 'vi7'],
      ],
      bridge: [
        ['ii7', 'V7', 'IM7', 'VIM7'],
        ['IVM7', 'bVII', 'IM7', 'IM7'],
      ],
    },
    sectionTemplate: ['intro', 'verse', 'prechorus', 'chorus', 'verse', 'prechorus', 'chorus', 'bridge', 'chorus', 'outro'],
    drumPatterns: ['citypop16', 'discoFour'],
    parts: [
      { role: 'harmony', voice: 'epiano', gain: 0.42, pan: -0.2, octave: 4, density: 0.55, reverbSend: 0.22, delaySend: 0.18, minEnergy: 0.0, style: 'stab' },
      { role: 'arp', voice: 'pluck', gain: 0.26, pan: 0.32, octave: 5, density: 0.75, reverbSend: 0.2, delaySend: 0.35, minEnergy: 0.35, style: 'arpUpDown' },
      { role: 'texture', voice: 'strings', gain: 0.2, pan: 0.1, octave: 4, density: 0.2, reverbSend: 0.4, delaySend: 0.05, minEnergy: 0.6, style: 'sustain' },
      { role: 'lead', voice: 'lead', gain: 0.24, pan: 0.0, octave: 5, density: 0.55, reverbSend: 0.24, delaySend: 0.26, minEnergy: 0.7 },
    ],
    reverb: { seconds: 2.0, decay: 2.2, mix: 0.24 },
    delay: { noteDiv: 0.75, feedback: 0.3, mix: 0.2 },
    sidechain: 0.15,
    master: { highpass: 28, drive: 0.1 },
    humanize: 0.35,
    bassStyle: 'octave',
  },

  edm: {
    id: 'edm',
    labelJa: 'EDM',
    labelEn: 'EDM / Future House',
    descJa: '4 つ打ちとサイドチェイン。フロア向けの高揚感。',
    tempo: [122, 128],
    swing: 0,
    scales: [
      ['minor', 4],
      ['phrygian', 1],
      ['dorian', 2],
    ],
    progressions: {
      chorus: [
        ['i', 'bVI', 'bIII', 'bVII'],
        ['i', 'bVII', 'bVI', 'bVII'],
        ['bVI', 'bVII', 'i', 'i'],
      ],
      verse: [
        ['i', 'bVI', 'bVII', 'v'],
        ['i', 'iv', 'bVI', 'bVII'],
      ],
      bridge: [
        ['iv', 'bVI', 'bIII', 'bVII'],
        ['bVI', 'bIII', 'bVII', 'iv'],
      ],
    },
    sectionTemplate: ['intro', 'verse', 'prechorus', 'chorus', 'break', 'verse', 'prechorus', 'chorus', 'outro'],
    drumPatterns: ['fourOnFloor', 'houseShuffle'],
    parts: [
      { role: 'harmony', voice: 'pad', gain: 0.32, pan: 0.0, octave: 4, density: 0.25, reverbSend: 0.38, delaySend: 0.1, minEnergy: 0.0, style: 'sustain' },
      { role: 'arp', voice: 'pluck', gain: 0.3, pan: -0.25, octave: 5, density: 0.85, reverbSend: 0.2, delaySend: 0.3, minEnergy: 0.3, style: 'arpUp' },
      { role: 'lead', voice: 'lead', gain: 0.3, pan: 0.0, octave: 5, density: 0.6, reverbSend: 0.22, delaySend: 0.24, minEnergy: 0.72 },
    ],
    reverb: { seconds: 2.4, decay: 2.0, mix: 0.26 },
    delay: { noteDiv: 0.5, feedback: 0.34, mix: 0.2 },
    sidechain: 0.75,
    master: { highpass: 30, drive: 0.2 },
    humanize: 0.06,
    bassStyle: 'driving',
  },

  rock: {
    id: 'rock',
    labelJa: 'ロック',
    labelEn: 'Rock',
    descJa: '歪んだギターと 8 ビート。まっすぐで力強い。',
    tempo: [118, 158],
    swing: 0,
    scales: [
      ['minor', 3],
      ['mixolydian', 2],
      ['major', 2],
    ],
    progressions: {
      chorus: [
        ['I', 'V', 'vi', 'IV'],
        ['vi', 'IV', 'I', 'V'],
        ['i', 'bVII', 'bVI', 'bVII'],
      ],
      verse: [
        ['vi', 'IV', 'I', 'V'],
        ['i', 'bVI', 'bIII', 'bVII'],
        ['I', 'IV', 'vi', 'V'],
      ],
      bridge: [
        ['IV', 'I', 'V', 'vi'],
        ['bVI', 'bVII', 'i', 'i'],
      ],
    },
    sectionTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    drumPatterns: ['rock8', 'halfTimeRock'],
    parts: [
      { role: 'harmony', voice: 'guitar', gain: 0.3, pan: -0.42, octave: 3, density: 0.65, reverbSend: 0.14, delaySend: 0.06, minEnergy: 0.25, style: 'power' },
      { role: 'texture', voice: 'guitar', gain: 0.24, pan: 0.42, octave: 3, density: 0.65, reverbSend: 0.14, delaySend: 0.06, minEnergy: 0.45, style: 'power' },
      { role: 'arp', voice: 'piano', gain: 0.18, pan: 0.12, octave: 4, density: 0.4, reverbSend: 0.2, delaySend: 0.05, minEnergy: 0.0, style: 'broken' },
      { role: 'lead', voice: 'lead', gain: 0.26, pan: 0.0, octave: 5, density: 0.6, reverbSend: 0.2, delaySend: 0.18, minEnergy: 0.7 },
    ],
    reverb: { seconds: 1.5, decay: 2.4, mix: 0.16 },
    delay: { noteDiv: 0.5, feedback: 0.24, mix: 0.12 },
    sidechain: 0.0,
    master: { highpass: 35, drive: 0.35 },
    humanize: 0.45,
    bassStyle: 'root',
  },

  ambient: {
    id: 'ambient',
    labelJa: 'アンビエント',
    labelEn: 'Ambient',
    descJa: '長い残響とゆるやかな和音。眠りと瞑想のために。',
    tempo: [58, 76],
    swing: 0,
    scales: [
      ['lydian', 2],
      ['major', 2],
      ['dorian', 2],
      ['minor', 2],
    ],
    progressions: {
      chorus: [
        ['IM7', 'IVM7'],
        ['IM7', 'iii7', 'IVM7', 'IM7'],
        ['i7', 'bVIM7'],
      ],
      verse: [
        ['IM7', 'IVM7'],
        ['vi7', 'IVM7'],
        ['i7', 'iv7'],
      ],
      bridge: [
        ['IVM7', 'IM7'],
        ['bVIM7', 'bVII'],
      ],
    },
    sectionTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    drumPatterns: ['sparse'],
    parts: [
      { role: 'harmony', voice: 'pad', gain: 0.4, pan: -0.1, octave: 3, density: 0.15, reverbSend: 0.62, delaySend: 0.14, minEnergy: 0.0, style: 'sustain' },
      { role: 'texture', voice: 'strings', gain: 0.24, pan: 0.2, octave: 4, density: 0.15, reverbSend: 0.55, delaySend: 0.1, minEnergy: 0.3, style: 'sustain' },
      { role: 'arp', voice: 'bell', gain: 0.2, pan: 0.3, octave: 5, density: 0.3, reverbSend: 0.6, delaySend: 0.4, minEnergy: 0.35, style: 'arpRandom' },
      { role: 'lead', voice: 'piano', gain: 0.22, pan: -0.15, octave: 5, density: 0.3, reverbSend: 0.55, delaySend: 0.3, minEnergy: 0.4 },
    ],
    reverb: { seconds: 5.5, decay: 1.6, mix: 0.6 },
    delay: { noteDiv: 1.0, feedback: 0.42, mix: 0.3 },
    sidechain: 0.0,
    master: { lowpass: 9000 },
    humanize: 0.5,
    bassStyle: 'root',
  },

  jazz: {
    id: 'jazz',
    labelJa: 'ジャズ',
    labelEn: 'Jazz',
    descJa: 'スウィングするライドとウォーキングベース。',
    tempo: [96, 140],
    swing: 0.62,
    scales: [
      ['dorian', 3],
      ['major', 3],
      ['minor', 2],
      ['mixolydian', 2],
    ],
    progressions: {
      chorus: [
        ['ii7', 'V7', 'IM7', 'VIM7'],
        ['IM7', 'vi7', 'ii7', 'V7'],
        ['iii7', 'VI7', 'ii7', 'V7'],
      ],
      verse: [
        ['IM7', 'IVM7', 'iii7', 'VI7'],
        ['ii7', 'V7', 'iii7', 'VI7'],
        ['i7', 'iv7', 'bVII', 'bIIIM7'],
      ],
      bridge: [
        ['IVM7', 'bVII', 'IM7', 'VIM7'],
        ['ii7', 'V7', 'IM7', 'IM7'],
      ],
    },
    sectionTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    drumPatterns: ['swingRide', 'bossa'],
    parts: [
      { role: 'harmony', voice: 'piano', gain: 0.36, pan: -0.18, octave: 4, density: 0.5, reverbSend: 0.24, delaySend: 0.04, minEnergy: 0.0, style: 'stab' },
      { role: 'texture', voice: 'epiano', gain: 0.16, pan: 0.22, octave: 4, density: 0.3, reverbSend: 0.28, delaySend: 0.05, minEnergy: 0.5, style: 'sustain' },
      { role: 'lead', voice: 'piano', gain: 0.3, pan: 0.08, octave: 5, density: 0.7, reverbSend: 0.22, delaySend: 0.06, minEnergy: 0.35 },
    ],
    reverb: { seconds: 1.8, decay: 2.4, mix: 0.2 },
    delay: { noteDiv: 0.5, feedback: 0.18, mix: 0.06 },
    sidechain: 0.0,
    master: { highpass: 32 },
    humanize: 0.85,
    bassStyle: 'walking',
  },

  trap: {
    id: 'trap',
    labelJa: 'トラップ',
    labelEn: 'Trap',
    descJa: '唸る 808 とロールするハイハット。ダークで重い。',
    tempo: [132, 150],
    swing: 0.04,
    scales: [
      ['minorPentatonic', 3],
      ['harmonicMinor', 2],
      ['phrygian', 2],
      ['minor', 3],
    ],
    progressions: {
      chorus: [
        ['i', 'bVI', 'bVII', 'bVII'],
        ['i', 'iv', 'bVI', 'V'],
        ['i', 'bVII', 'bVI', 'bVII'],
      ],
      verse: [
        ['i', 'bVI', 'bIII', 'bVII'],
        ['i', 'i', 'iv', 'bVI'],
      ],
      bridge: [
        ['iv', 'bVI', 'i', 'V'],
        ['bVI', 'bVII', 'i', 'i'],
      ],
    },
    sectionTemplate: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'break', 'chorus', 'outro'],
    drumPatterns: ['trapRoll', 'trapSparse'],
    parts: [
      { role: 'harmony', voice: 'pad', gain: 0.24, pan: 0.0, octave: 4, density: 0.2, reverbSend: 0.42, delaySend: 0.1, minEnergy: 0.0, style: 'sustain' },
      { role: 'arp', voice: 'bell', gain: 0.26, pan: 0.24, octave: 5, density: 0.55, reverbSend: 0.34, delaySend: 0.36, minEnergy: 0.25, style: 'arpUpDown' },
      { role: 'lead', voice: 'pluck', gain: 0.24, pan: -0.18, octave: 5, density: 0.5, reverbSend: 0.28, delaySend: 0.3, minEnergy: 0.6 },
    ],
    reverb: { seconds: 2.6, decay: 2.0, mix: 0.28 },
    delay: { noteDiv: 0.75, feedback: 0.36, mix: 0.2 },
    sidechain: 0.4,
    master: { highpass: 24, drive: 0.25 },
    humanize: 0.2,
    bassStyle: 'slide808',
  },

  cinematic: {
    id: 'cinematic',
    labelJa: 'シネマティック',
    labelEn: 'Cinematic',
    descJa: '重なるストリングスと打楽器。予告編のような高まり。',
    tempo: [76, 100],
    swing: 0,
    scales: [
      ['minor', 4],
      ['dorian', 2],
      ['harmonicMinor', 2],
    ],
    progressions: {
      chorus: [
        ['i', 'bVII', 'bVI', 'bVII'],
        ['i', 'bVI', 'bIII', 'bVII'],
        ['i', 'iv', 'i', 'V'],
      ],
      verse: [
        ['i', 'bVI', 'iv', 'bVII'],
        ['i', 'v', 'bVI', 'bVII'],
      ],
      bridge: [
        ['iv', 'bVI', 'bVII', 'i'],
        ['bVI', 'bVII', 'v', 'i'],
      ],
    },
    sectionTemplate: ['intro', 'verse', 'prechorus', 'chorus', 'break', 'verse', 'chorus', 'outro'],
    drumPatterns: ['epicTaiko', 'sparse'],
    parts: [
      { role: 'harmony', voice: 'strings', gain: 0.36, pan: -0.16, octave: 3, density: 0.2, reverbSend: 0.5, delaySend: 0.06, minEnergy: 0.0, style: 'sustain' },
      { role: 'texture', voice: 'pad', gain: 0.24, pan: 0.18, octave: 3, density: 0.15, reverbSend: 0.55, delaySend: 0.08, minEnergy: 0.2, style: 'sustain' },
      { role: 'arp', voice: 'piano', gain: 0.24, pan: 0.1, octave: 4, density: 0.7, reverbSend: 0.4, delaySend: 0.12, minEnergy: 0.45, style: 'arpUp' },
      { role: 'lead', voice: 'strings', gain: 0.3, pan: 0.0, octave: 5, density: 0.35, reverbSend: 0.45, delaySend: 0.1, minEnergy: 0.55 },
    ],
    reverb: { seconds: 4.0, decay: 1.8, mix: 0.45 },
    delay: { noteDiv: 0.5, feedback: 0.2, mix: 0.08 },
    sidechain: 0.0,
    master: { highpass: 28, drive: 0.12 },
    humanize: 0.4,
    bassStyle: 'root',
  },
};

export const GENRE_LIST: GenrePreset[] = [
  GENRE_PRESETS.lofi,
  GENRE_PRESETS.citypop,
  GENRE_PRESETS.edm,
  GENRE_PRESETS.rock,
  GENRE_PRESETS.ambient,
  GENRE_PRESETS.jazz,
  GENRE_PRESETS.trap,
  GENRE_PRESETS.cinematic,
];
