import { basePath } from '@/lib/basePath';
import { createElevenLabsProvider, ELEVENLABS_ID } from './elevenlabs';
import { LOCAL_SYNTH_ID, localSynthProvider } from './localSynth';
import { readPassphrase } from './passphrase';
import type { MusicProvider } from './types';

const elevenLabsProvider = createElevenLabsProvider({
  // fetch には basePath が自動で付かないので、ここで織り込む。
  // 末尾のスラッシュは next.config.ts の trailingSlash: true に合わせる
  // （付けないと 308 リダイレクトを 1 往復することになる）
  endpoint: `${basePath}/api/music/`,
  getPassphrase: readPassphrase,
});

const PROVIDERS: MusicProvider[] = [localSynthProvider, elevenLabsProvider];

/** いま実際に使えるものだけを返す。使えないものは UI に出さない */
export function listProviders(): MusicProvider[] {
  return PROVIDERS.filter((p) => p.isAvailable());
}

export function findProvider(id: string): MusicProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * 見つからない／使えない場合は内蔵シンセにフォールバックする。
 * ただし「AI を選んだのに黙ってシンセが鳴る」事故を避けるため、
 * 選択 UI 側は listProviders() の結果だけを出すこと。
 */
export function getProvider(id: string): MusicProvider {
  const found = findProvider(id);
  if (found && found.isAvailable()) return found;
  return localSynthProvider;
}

export { ELEVENLABS_ID, LOCAL_SYNTH_ID, localSynthProvider };
export { PassphraseError } from './elevenlabs';
export type { MusicProvider };
export type { GenerateOptions } from './types';
