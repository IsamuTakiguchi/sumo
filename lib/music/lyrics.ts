/**
 * 日本語歌詞のルールベース生成。
 *
 * ムード別の語彙バンクから、行テンプレートを埋めて作る。
 * サビの 1 行目は「フック」として全サビで使い回し、繰り返し感を出す。
 *
 * 注意: 生成されるのはテキストのみで、歌声は合成されない（UI にもその旨を表示する）。
 */

import type { MoodId, Section, SectionKind } from '@/lib/types';
import { chance, pick, shuffle, type Rng } from '@/lib/random';
import type { PromptHints } from './prompt';

interface VocabBank {
  /** 情景の名詞 */
  scene: string[];
  /** 心情の名詞 */
  feeling: string[];
  /** 形容詞（連体形） */
  adj: string[];
  /** 動詞（テ形） */
  verbTe: string[];
  /** 時間帯 */
  time: string[];
}

const COMMON: VocabBank = {
  scene: ['街', '窓', '坂道', '交差点', '海辺', '空', '駅前', '部屋', '道', '橋'],
  feeling: ['気持ち', '想い', '記憶', '言葉', '約束', '溜息', '鼓動', '願い'],
  adj: ['小さな', '遠い', '静かな', '確かな', '新しい'],
  verbTe: ['歩いて', '探して', '数えて', '待って', '見つけて', '揺れて'],
  time: ['朝', '昼下がり', '夕暮れ', '夜', '真夜中', '明け方'],
};

const BANKS: Partial<Record<MoodId, VocabBank>> = {
  sad: {
    scene: ['雨の街', '濡れた窓', '終電のホーム', '消えた灯り', '冷えた指先', '静かな部屋'],
    feeling: ['さよなら', '未練', '涙', '記憶', '面影', '空白'],
    adj: ['冷たい', '遠い', '小さな', '届かない', '戻らない'],
    verbTe: ['消えて', '零れて', '沈んで', '途切れて', '忘れて'],
    time: ['夜', '真夜中', '明け方', '雨の日'],
  },
  happy: {
    scene: ['青い空', '海沿いの道', '陽だまり', '風の丘', '賑やかな街', '開いた窓'],
    feeling: ['笑顔', '鼓動', 'ときめき', '合図', '今日'],
    adj: ['眩しい', '新しい', '軽やかな', '大きな', '弾んだ'],
    verbTe: ['走って', '笑って', '飛び出して', '駆けて', '始まって'],
    time: ['朝', '昼下がり', '真昼', '週末'],
  },
  chill: {
    scene: ['窓辺', '古いソファ', '湯気の向こう', '午後の部屋', '静かな公園'],
    feeling: ['まどろみ', '溜息', '余白', '静けさ', '時間'],
    adj: ['ゆるやかな', '柔らかい', '穏やかな', '長い'],
    verbTe: ['溶けて', 'まどろんで', '流れて', '漂って', '休んで'],
    time: ['昼下がり', '夕暮れ', '休日', '午後'],
  },
  energetic: {
    scene: ['夜明けの道', '人混み', '光の中', '坂の頂上', '走るハイウェイ'],
    feeling: ['鼓動', '衝動', '合図', '始まり', '熱'],
    adj: ['熱い', '速い', '眩しい', '止まらない'],
    verbTe: ['駆けて', '叫んで', '弾けて', '飛んで', '越えて'],
    time: ['夜明け', '今夜', '今日', 'この瞬間'],
  },
  dreamy: {
    scene: ['星の海', '白い霧', '眠りの淵', '銀河の端', '透明な水'],
    feeling: ['夢', '幻', '囁き', '記憶', '光'],
    adj: ['淡い', '透明な', '遥かな', '溶けそうな'],
    verbTe: ['漂って', '瞬いて', '溶けて', '眠って', '揺らいで'],
    time: ['真夜中', '明け方', '眠る前', '夜更け'],
  },
  dark: {
    scene: ['暗い路地', '割れた鏡', '閉ざした扉', '底なしの影', '無人の街'],
    feeling: ['影', '沈黙', '棘', '嘘', '傷'],
    adj: ['深い', '重い', '見えない', '鋭い'],
    verbTe: ['沈んで', '軋んで', '呑まれて', '崩れて', '隠れて'],
    time: ['真夜中', '闇の中', '終わりの日'],
  },
  epic: {
    scene: ['地平線', '荒れた大地', '果ての空', '嵐の海', '高い城壁'],
    feeling: ['誓い', '運命', '祈り', '旗', '記憶'],
    adj: ['遥かな', '果てない', '烈しい', '大きな'],
    verbTe: ['越えて', '掲げて', '進んで', '砕いて', '立ち上がって'],
    time: ['夜明け', 'その日', '最後の朝'],
  },
  romantic: {
    scene: ['ふたりの部屋', '手のひら', '灯りの下', '並木道', '肩越しの空'],
    feeling: ['恋', '温もり', '鼓動', '名前', '約束'],
    adj: ['優しい', '甘い', '近い', '確かな'],
    verbTe: ['触れて', '重ねて', '見つめて', '寄り添って', '結んで'],
    time: ['夕暮れ', '夜', '週末', 'あの日'],
  },
  nostalgic: {
    scene: ['古い校舎', '色褪せた写真', '夏の匂い', '錆びた自転車', '実家の窓'],
    feeling: ['思い出', '面影', '約束', '声', '夏の日'],
    adj: ['懐かしい', '色褪せた', '遠い', '幼い'],
    verbTe: ['思い出して', '巡って', '重なって', '褪せて', '辿って'],
    time: ['あの夏', 'あの頃', '夕暮れ', '帰り道'],
  },
};

// 助詞の据わりが崩れないよう、動詞はテ形（{verbTe}）を中心に組む
const LINE_TEMPLATES = [
  '{time}の{scene}で {verbTe}いた',
  '{scene}に {feeling}を置いてきた',
  '{adj}{scene}へ {verbTe}ゆく',
  '{time}を {verbTe} {feeling}を探す',
  '{adj}{feeling}だけが 残っている',
  '{scene}の向こうへ {verbTe}いく',
  '{feeling}とともに {time}を待つ',
  '{adj}{scene}が 遠ざかる',
];

const HOOK_TEMPLATES = [
  '{feeling}よ 届いてほしい',
  'この{feeling}が 消えるまで',
  '{adj}{scene}へ 連れて行って',
  '{time}を越えて 会いにゆく',
  'もう一度だけ {verbTe}みたい',
];

export interface LyricLine {
  text: string;
  mora: number;
}

export interface LyricSection {
  kind: SectionKind;
  labelJa: string;
  lines: LyricLine[];
}

/** 拗音を 1 モーラに数える（「きゃ」= 1）。撥音・促音・長音は 1 モーラ */
export function countMora(s: string): number {
  const kana = s.replace(/[^ぁ-ゟァ-ヺー]/g, '');
  const small = /[ゃゅょャュョぁぃぅぇぉァィゥェォ]/;
  let count = 0;
  for (let i = 0; i < kana.length; i++) {
    if (small.test(kana[i])) continue;
    count++;
  }
  // 漢字は 1 文字あたり 2 モーラ程度として概算する
  const kanji = (s.match(/[一-鿿]/g) ?? []).length;
  return count + kanji * 2;
}

function bankFor(moods: MoodId[]): VocabBank {
  const banks = moods.map((m) => BANKS[m]).filter((b): b is VocabBank => !!b);
  if (banks.length === 0) return COMMON;
  const merged: VocabBank = {
    scene: [],
    feeling: [],
    adj: [],
    verbTe: [],
    time: [],
  };
  for (const b of [...banks, COMMON]) {
    merged.scene.push(...b.scene);
    merged.feeling.push(...b.feeling);
    merged.adj.push(...b.adj);
    merged.verbTe.push(...b.verbTe);
    merged.time.push(...b.time);
  }
  return merged;
}

function fill(template: string, bank: VocabBank, rng: Rng): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const list = (bank as unknown as Record<string, string[]>)[key];
    return list && list.length > 0 ? pick(rng, list) : '';
  });
}

/** モーラ数が 7〜14 に収まる行が出るまで作り直す */
function makeLine(templates: string[], bank: VocabBank, rng: Rng): LyricLine {
  let best: LyricLine | null = null;
  for (let i = 0; i < 8; i++) {
    const text = fill(pick(rng, templates), bank, rng);
    const mora = countMora(text);
    if (mora >= 7 && mora <= 14) return { text, mora };
    if (!best || Math.abs(mora - 10) < Math.abs(best.mora - 10)) best = { text, mora };
  }
  return best!;
}

const LINE_COUNT: Partial<Record<SectionKind, number>> = {
  verse: 4,
  prechorus: 2,
  chorus: 4,
  bridge: 2,
};

export function generateLyrics(
  hints: PromptHints,
  moods: MoodId[],
  sections: Section[],
  rng: Rng,
): LyricSection[] {
  const bank = bankFor(moods);

  // プロンプトから拾った語を優先的に混ぜて、指示に沿っている感を出す
  if (hints.keywords.length > 0) {
    bank.scene = [...hints.keywords, ...hints.keywords, ...bank.scene];
  }

  const hook = makeLine(HOOK_TEMPLATES, bank, rng);
  const out: LyricSection[] = [];
  let verseIndex = 0;

  for (const section of sections) {
    const count = LINE_COUNT[section.kind];
    if (!count) continue;

    const lines: LyricLine[] = [];
    if (section.kind === 'chorus') {
      lines.push(hook);
      for (let i = 1; i < count; i++) lines.push(makeLine(LINE_TEMPLATES, bank, rng));
    } else {
      for (let i = 0; i < count; i++) lines.push(makeLine(LINE_TEMPLATES, bank, rng));
    }

    out.push({
      kind: section.kind,
      labelJa: section.kind === 'verse' ? `${section.labelJa}${++verseIndex}` : section.labelJa,
      lines,
    });
  }

  return out;
}

export function lyricsToText(sections: LyricSection[]): string {
  return sections
    .map((s) => `[${s.labelJa}]\n${s.lines.map((l) => l.text).join('\n')}`)
    .join('\n\n');
}

/** 曲名の自動生成 */
export function generateTitle(
  hints: PromptHints,
  moods: MoodId[],
  rng: Rng,
  instrumental: boolean,
): string {
  const bank = bankFor(moods);
  const words = hints.keywords.length > 0 ? shuffle(rng, hints.keywords) : [];
  const head = words[0] ?? pick(rng, bank.scene);
  const tail = pick(rng, [...bank.feeling, ...bank.scene]);

  const patterns = [
    () => `${head}の${tail}`,
    () => `${pick(rng, bank.adj)}${tail}`,
    () => `${head}と${tail}`,
    () => `${pick(rng, bank.time)}の${head}`,
    () => `${head}、${pick(rng, bank.verbTe)}`,
  ];
  const title = pick(rng, patterns)();
  return instrumental && chance(rng, 0.12) ? `${title}（instrumental）` : title;
}
