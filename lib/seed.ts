import type { GenerationRequest } from '@/lib/types';
import { hashString } from '@/lib/random';

/**
 * リクエストからシードを決める。
 *
 * ユーザーがシードを指定していればそれをそのまま使う（＝完全な再現）。
 * 指定がなければプロンプト・設定・現在時刻から導出する。
 *
 * Date.now() を使うのはここだけ。生成パイプライン（lib/music, lib/audio）の
 * 内側では ESLint で禁止しており、決定性が保たれる。
 */
export function resolveSeed(req: GenerationRequest): number {
  if (req.seed !== null && Number.isFinite(req.seed)) return req.seed >>> 0;
  const material = [
    req.prompt,
    req.genre,
    req.moods.join(','),
    req.instruments.join(','),
    String(req.tempo ?? 'auto'),
    String(req.durationSec),
    req.vocal,
    String(Date.now()),
  ].join('|');
  return hashString(material);
}
