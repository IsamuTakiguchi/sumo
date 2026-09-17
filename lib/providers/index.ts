import { LOCAL_SYNTH_ID, localSynthProvider } from './localSynth';
import { createRemoteProvider } from './remote';
import type { MusicProvider } from './types';

const remoteProvider = createRemoteProvider({
  endpoint: '/api/generate',
  model: 'musicgen',
});

const PROVIDERS: MusicProvider[] = [localSynthProvider, remoteProvider];

export function listProviders(): MusicProvider[] {
  return PROVIDERS;
}

/** 見つからない／使えない場合は必ず内蔵シンセにフォールバックする */
export function getProvider(id: string): MusicProvider {
  const found = PROVIDERS.find((p) => p.id === id);
  if (found && found.isAvailable()) return found;
  return localSynthProvider;
}

export { LOCAL_SYNTH_ID, localSynthProvider };
export type { MusicProvider };
export type { GenerateOptions } from './types';
