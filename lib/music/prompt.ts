/**
 * 日本語・英語のプロンプトからパラメータのヒントを抽出する。
 *
 * 形態素解析は使わず、キーワードの部分一致で十分な精度が出る。
 * 抽出結果はあくまで「ヒント」で、UI で明示的に選ばれた値が常に優先される。
 */

import type { GenreId, MoodId, VoiceId } from '@/lib/types';

export interface PromptHints {
  genre: GenreId | null;
  moods: MoodId[];
  instruments: VoiceId[];
  /** -1..+1 */
  tempoBias: number;
  brightnessBias: number;
  densityBias: number;
  energyBias: number;
  /** プロンプトに BPM が明記されていた場合 */
  explicitTempo: number | null;
  /** タイトルや歌詞に使う語 */
  keywords: string[];
  /** ユーザーに「こう解釈しました」と見せるための説明 */
  notes: string[];
}

interface Rule {
  words: string[];
  genre?: GenreId;
  moods?: MoodId[];
  instruments?: VoiceId[];
  tempo?: number;
  brightness?: number;
  density?: number;
  energy?: number;
  noteJa: string;
}

const RULES: Rule[] = [
  // ジャンル
  { words: ['lo-fi', 'lofi', 'ローファイ', '作業用', '勉強', 'チルホップ'], genre: 'lofi', moods: ['chill'], tempo: -0.3, density: -0.3, noteJa: 'ローファイ寄りに' },
  { words: ['シティポップ', 'city pop', 'citypop', '和製', 'ドライブ', '夜のドライブ'], genre: 'citypop', tempo: 0.1, brightness: 0.25, noteJa: 'シティポップ寄りに' },
  { words: ['edm', 'クラブ', 'ダンス', 'フェス', 'ハウス', 'テクノ', '踊れる'], genre: 'edm', energy: 0.4, tempo: 0.3, noteJa: 'EDM 寄りに' },
  { words: ['ロック', 'rock', 'バンド', 'ギターソロ', 'パンク'], genre: 'rock', energy: 0.35, noteJa: 'ロック寄りに' },
  { words: ['アンビエント', 'ambient', '瞑想', '睡眠', 'ヒーリング', 'environment'], genre: 'ambient', tempo: -0.4, density: -0.5, noteJa: 'アンビエント寄りに' },
  { words: ['ジャズ', 'jazz', 'ボサノバ', 'ボサノヴァ', 'カフェ', 'スウィング'], genre: 'jazz', noteJa: 'ジャズ寄りに' },
  { words: ['トラップ', 'trap', '808', 'ヒップホップ', 'hiphop', 'hip hop', 'ラップ'], genre: 'trap', brightness: -0.25, noteJa: 'トラップ寄りに' },
  { words: ['シネマティック', '映画', '劇伴', 'サントラ', 'トレーラー', '予告編', 'epic'], genre: 'cinematic', energy: 0.3, noteJa: 'シネマティック寄りに' },

  // ムード・情景
  { words: ['切ない', '悲しい', '泣ける', '涙', '失恋', 'sad', 'melancholy', 'さみしい', '寂しい'], moods: ['sad'], tempo: -0.2, brightness: -0.3, noteJa: '切ないムードに' },
  { words: ['明るい', '楽しい', 'ハッピー', '元気', 'happy', '笑顔', 'お祝い'], moods: ['happy'], brightness: 0.4, energy: 0.2, noteJa: '明るいムードに' },
  { words: ['夏', '海', '青空', '爽やか', 'さわやか', '太陽', 'リゾート'], moods: ['happy'], brightness: 0.4, energy: 0.15, noteJa: '夏らしい明るさに' },
  { words: ['夜', '深夜', 'ネオン', '雨', '冬', '曇り', '都会'], moods: ['nostalgic'], brightness: -0.3, noteJa: '夜の空気感に' },
  { words: ['疾走感', '激しい', '熱い', '盛り上が', '全力', 'アップテンポ', '速い', 'energetic'], moods: ['energetic'], energy: 0.5, tempo: 0.35, density: 0.3, noteJa: '疾走感を強めに' },
  { words: ['落ち着', 'ゆったり', 'まったり', 'のんびり', 'chill', 'relax', 'リラックス', '穏やか'], moods: ['chill'], tempo: -0.3, density: -0.3, energy: -0.3, noteJa: '落ち着いたテンポに' },
  { words: ['幻想', '夢', 'ドリーミー', 'dreamy', '宇宙', '星', 'ふわふわ'], moods: ['dreamy'], brightness: 0.15, density: -0.2, noteJa: '幻想的な響きに' },
  { words: ['ダーク', '暗い', '不穏', 'ホラー', '怖い', 'dark', '闇'], moods: ['dark'], brightness: -0.5, noteJa: 'ダークな響きに' },
  { words: ['壮大', 'エピック', '荘厳', '大自然', '感動'], moods: ['epic'], energy: 0.3, noteJa: '壮大な展開に' },
  { words: ['恋', 'ロマンチック', 'ラブ', 'love', '甘い', 'バラード'], moods: ['romantic'], tempo: -0.15, brightness: 0.2, noteJa: 'ロマンチックに' },
  { words: ['懐かし', 'ノスタル', '昭和', 'レトロ', '思い出', '幼い頃'], moods: ['nostalgic'], brightness: -0.2, noteJa: 'ノスタルジックに' },

  // 楽器
  { words: ['ピアノ', 'piano'], instruments: ['piano'], noteJa: 'ピアノを追加' },
  { words: ['エレピ', 'ローズ', 'electric piano', 'rhodes'], instruments: ['epiano'], noteJa: 'エレピを追加' },
  { words: ['ギター', 'guitar'], instruments: ['guitar'], noteJa: 'ギターを追加' },
  { words: ['ストリングス', '弦楽', 'オーケストラ', 'strings', 'バイオリン'], instruments: ['strings'], noteJa: 'ストリングスを追加' },
  { words: ['パッド', 'シンセ', 'synth', 'pad'], instruments: ['pad'], noteJa: 'シンセパッドを追加' },
  { words: ['リード', 'lead', 'ソロ'], instruments: ['lead'], noteJa: 'シンセリードを追加' },
  { words: ['ベル', 'チャイム', 'オルゴール', 'bell', 'glocken'], instruments: ['bell'], noteJa: 'ベルを追加' },
  { words: ['プラック', 'pluck', 'アルペジオ'], instruments: ['pluck'], noteJa: 'プラックを追加' },
];

/** タイトルや歌詞の素材になりやすい名詞 */
const KEYWORD_SOURCES = [
  '夜', '街', '雨', '海', '空', '星', '風', '夏', '冬', '春', '秋', '朝', '夕暮れ',
  'ネオン', '窓', '電車', '駅', '坂', '橋', '光', '影', '声', 'ドライブ', '夢',
  '約束', '記憶', '手紙', '花', '雪', '波', '月', '太陽', '虹', '扉', '道', '季節',
];

function clamp(v: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

export function analyzePrompt(text: string): PromptHints {
  const lower = text.toLowerCase();
  const hints: PromptHints = {
    genre: null,
    moods: [],
    instruments: [],
    tempoBias: 0,
    brightnessBias: 0,
    densityBias: 0,
    energyBias: 0,
    explicitTempo: null,
    keywords: [],
    notes: [],
  };

  for (const rule of RULES) {
    const hit = rule.words.some((w) => lower.includes(w.toLowerCase()));
    if (!hit) continue;

    if (rule.genre && hints.genre === null) hints.genre = rule.genre;
    if (rule.moods) {
      for (const m of rule.moods) if (!hints.moods.includes(m)) hints.moods.push(m);
    }
    if (rule.instruments) {
      for (const i of rule.instruments) if (!hints.instruments.includes(i)) hints.instruments.push(i);
    }
    hints.tempoBias += rule.tempo ?? 0;
    hints.brightnessBias += rule.brightness ?? 0;
    hints.densityBias += rule.density ?? 0;
    hints.energyBias += rule.energy ?? 0;
    hints.notes.push(rule.noteJa);
  }

  // 「120BPM」「bpm 90」のような明示指定
  const bpmMatch = /(\d{2,3})\s*(?:bpm|BPM|ビーピーエム)|(?:bpm|BPM)\s*[:：]?\s*(\d{2,3})/.exec(text);
  if (bpmMatch) {
    const n = Number(bpmMatch[1] ?? bpmMatch[2]);
    if (Number.isFinite(n) && n >= 40 && n <= 220) {
      hints.explicitTempo = n;
      hints.notes.push(`テンポを ${n} BPM に固定`);
    }
  }

  for (const w of KEYWORD_SOURCES) {
    if (text.includes(w)) hints.keywords.push(w);
  }

  hints.tempoBias = clamp(hints.tempoBias);
  hints.brightnessBias = clamp(hints.brightnessBias);
  hints.densityBias = clamp(hints.densityBias);
  hints.energyBias = clamp(hints.energyBias);
  hints.moods = hints.moods.slice(0, 3);
  hints.notes = Array.from(new Set(hints.notes)).slice(0, 5);

  return hints;
}

/** プロンプト入力欄の下に出す作例 */
export const PROMPT_EXAMPLES = [
  '雨の夜、ネオンの街を歩くような切ないシティポップ',
  '勉強がはかどる、よれたドラムと温かいエレピのローファイ',
  '真夏のフェスで一気に盛り上がる、疾走感のある EDM 140BPM',
  '星空の下で眠りにつくような、静かで幻想的なアンビエント',
];
