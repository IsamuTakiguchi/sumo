/**
 * ElevenLabs Music を叩く唯一の場所。
 *
 * API キーはここから外に出さない。ブラウザに置くことは ElevenLabs 自身が禁じており、
 * CORS でも弾かれる。だからこのアプリはサーバーを必要とし、GitHub Pages のような
 * 静的配信では AI 生成が使えない（内蔵シンセは静的配信でも動く）。
 *
 * 必要な環境変数:
 *   ELEVENLABS_API_KEY  … ElevenLabs の API キー
 *   APP_PASSPHRASE      … AI 生成を使うための合い言葉
 *
 * どちらか欠けていると 503 を返して生成を拒む。公開サイトに鍵を掛け忘れたまま
 * 誰でも課金できる状態になるのを防ぐため、合い言葉が未設定でも「素通し」にはしない。
 */

import { timingSafeEqual } from 'node:crypto';
import {
  MAX_CHARS_PER_LINE,
  MAX_DURATION_SEC,
  MAX_LINES_PER_SECTION,
  MAX_SECTION_MS,
  MIN_DURATION_SEC,
  MIN_SECTION_MS,
  PASSPHRASE_HEADER,
  type MusicApiRequest,
  type MusicApiSection,
} from '@/lib/providers/musicApi';

export const runtime = 'nodejs';
// 生成は数十秒かかることがある。プラットフォーム側の上限を超える値を書いても
// そちらで切り詰められるだけなので、余裕を持たせておく
export const maxDuration = 300;

// 差し替え可能にしてあるのは、テストや社内プロキシ経由で叩くため。
// 未設定なら本物を見る
const ELEVENLABS_URL = process.env.ELEVENLABS_API_URL ?? 'https://api.elevenlabs.io/v1/music';
const MODEL_ID = 'music_v2_5';
const OUTPUT_FORMAT = 'mp3_44100_128';

function fail(status: number, messageJa: string, needsPassphrase = false): Response {
  return Response.json({ messageJa, needsPassphrase }, { status });
}

/** 長さの違いから合い言葉を推測されないよう、ハッシュせずとも定数時間で比べる */
function passphraseMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // 長さが違っても同じだけ時間を使う
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function clampDuration(sec: unknown): number {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? sec : MIN_DURATION_SEC;
  return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, Math.round(n)));
}

function cleanStyles(v: unknown, limit = 12): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * セクションを ElevenLabs の composition_plan に落とす。
 * 尺は合計がリクエストの長さに収まるよう比例配分し、1 セクションの上下限も守る。
 */
function toCompositionSections(
  sections: MusicApiSection[],
  totalSec: number,
): Record<string, unknown>[] | null {
  // 1 セクションの下限（3 秒）があるので、短い曲でセクションを刻みすぎると
  // 合計が指示した尺を超えてしまう。超えたぶんはそのまま課金されるので、
  // 入る本数まで先に減らす
  const maxSections = Math.max(1, Math.floor((totalSec * 1000) / MIN_SECTION_MS));
  const usable = sections
    .filter((s) => s && typeof s.name === 'string')
    .slice(0, Math.min(12, maxSections));
  if (usable.length === 0) return null;

  const weights = usable.map((s) => Math.max(1, s.durationSec || 1));
  const sum = weights.reduce((a, b) => a + b, 0);

  return usable.map((s, i) => {
    const ms = Math.round((weights[i] / sum) * totalSec * 1000);
    const lines = Array.isArray(s.lines)
      ? s.lines
          .filter((l): l is string => typeof l === 'string')
          .map((l) => l.trim().slice(0, MAX_CHARS_PER_LINE))
          .filter(Boolean)
          .slice(0, MAX_LINES_PER_SECTION)
      : [];
    return {
      section_name: s.name.slice(0, 60),
      positive_local_styles: cleanStyles(s.styles, 6),
      negative_local_styles: [],
      duration_ms: Math.min(MAX_SECTION_MS, Math.max(MIN_SECTION_MS, ms)),
      lines,
    };
  });
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const passphrase = process.env.APP_PASSPHRASE;

  if (!apiKey) {
    return fail(503, 'サーバーに ElevenLabs の API キーが設定されていません。');
  }
  if (!passphrase) {
    return fail(503, 'サーバーに合い言葉（APP_PASSPHRASE）が設定されていません。');
  }

  const given = request.headers.get(PASSPHRASE_HEADER) ?? '';
  if (!passphraseMatches(given, passphrase)) {
    return fail(401, '合い言葉が違います。', true);
  }

  let body: MusicApiRequest;
  try {
    body = (await request.json()) as MusicApiRequest;
  } catch {
    return fail(400, 'リクエストの形式が正しくありません。');
  }

  const durationSec = clampDuration(body.durationSec);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
  if (!prompt) {
    return fail(400, '曲の指示が空です。');
  }

  const sections = Array.isArray(body.sections)
    ? toCompositionSections(body.sections, durationSec)
    : null;

  const payload: Record<string, unknown> = {
    model_id: MODEL_ID,
    output_format: OUTPUT_FORMAT,
  };

  if (sections) {
    payload.composition_plan = {
      positive_global_styles: cleanStyles(
        Array.isArray(body.styles) && body.styles.length > 0 ? body.styles : prompt.split(','),
      ),
      negative_global_styles: cleanStyles(body.avoid, 8),
      sections,
    };
  } else {
    payload.prompt = prompt;
    payload.music_length_ms = durationSec * 1000;
    payload.force_instrumental = body.instrumental !== false;
  }

  let upstream: Response;
  try {
    upstream = await fetch(ELEVENLABS_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: request.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return fail(499, '中止されました。');
    }
    return fail(502, 'ElevenLabs に接続できませんでした。時間をおいて試してください。');
  }

  if (!upstream.ok) {
    // 上流のエラー本文はそのまま返さない。キーや内部情報が混じりうるため
    const messageJa =
      upstream.status === 401 || upstream.status === 403
        ? 'ElevenLabs の API キーが無効か、権限がありません。'
        : upstream.status === 422
          ? '曲の指示が ElevenLabs に受け付けられませんでした。プロンプトを変えて試してください。'
          : upstream.status === 429
            ? 'ElevenLabs の利用上限に達しました。しばらく待つか、プランを確認してください。'
            : `ElevenLabs がエラーを返しました（${upstream.status}）。`;
    console.error('[api/music] upstream error', upstream.status);
    return fail(502, messageJa);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'audio/mpeg',
      'cache-control': 'no-store',
      // 実際に課金された尺をクライアントに伝える（サーバーでクランプしているため）
      'x-sumo-duration-sec': String(durationSec),
    },
  });
}
