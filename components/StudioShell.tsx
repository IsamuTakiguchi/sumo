'use client';

import { useCallback, useMemo, useState } from 'react';
import type { GenerationRequest, GenreId, MoodId, Track, TrackMeta, VoiceId } from '@/lib/types';
import { GENRE_PRESETS } from '@/lib/music/genres';
import { INSTRUMENT_TAGS, MOODS } from '@/lib/music/moods';
import { analyzePrompt } from '@/lib/music/prompt';
import { LOCAL_SYNTH_ID } from '@/lib/providers';
import { getCachedTrack, release } from '@/lib/storage/audioCache';
import { useGenerator } from '@/lib/hooks/useGenerator';
import { useLibrary } from '@/lib/hooks/useLibrary';

import { Panel, FieldLabel } from '@/components/ui/primitives';
import { PromptComposer } from '@/components/compose/PromptComposer';
import { GenreGrid } from '@/components/compose/GenreGrid';
import { TagChips } from '@/components/compose/TagChips';
import { ParamControls, type ParamValues } from '@/components/compose/ParamControls';
import { SeedField } from '@/components/compose/SeedField';
import { GenerateBar } from '@/components/compose/GenerateBar';
import { AudioPlayer } from '@/components/player/AudioPlayer';
import { LyricsView } from '@/components/player/LyricsView';
import { TrackLibrary } from '@/components/library/TrackLibrary';

/** 永続化するのは生成条件だけ。音声（blob / peaks / arrangement）は保存しない */
function toMeta(track: Track): TrackMeta {
  return {
    id: track.id,
    title: track.title,
    createdAt: track.createdAt,
    request: track.request,
    spec: track.spec,
    durationSec: track.durationSec,
    sections: track.sections,
    lyrics: track.lyrics,
    providerId: track.providerId,
  };
}

export function StudioShell() {
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState<GenreId>('citypop');
  const [moods, setMoods] = useState<MoodId[]>([]);
  const [instruments, setInstruments] = useState<VoiceId[]>([]);
  const [seed, setSeed] = useState<number | null>(null);
  const [params, setParams] = useState<ParamValues>({
    tempo: null,
    durationSec: 60,
    key: null,
    vocal: 'instrumental',
  });

  const [current, setCurrent] = useState<Track | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const library = useLibrary();
  const generator = useGenerator();

  const preset = GENRE_PRESETS[genre];
  const hints = useMemo(() => analyzePrompt(prompt), [prompt]);
  const estimateSec = Math.max(2, Math.round(params.durationSec / 20));

  const buildRequest = useCallback(
    (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
      prompt,
      genre,
      moods,
      instruments,
      tempo: params.tempo,
      durationSec: params.durationSec,
      key: params.key,
      vocal: params.vocal,
      lyrics: null,
      seed,
      providerId: LOCAL_SYNTH_ID,
      ...overrides,
    }),
    [prompt, genre, moods, instruments, params, seed],
  );

  const runGeneration = useCallback(
    async (req: GenerationRequest) => {
      const track = await generator.generate(req);
      if (!track) return;
      setCurrent(track);
      setSeed(track.spec.seed);
      library.add(toMeta(track));
    },
    [generator, library],
  );

  const handleGenerate = useCallback(() => {
    void runGeneration(buildRequest());
  }, [buildRequest, runGeneration]);

  const handleRegenerateSameSeed = useCallback(() => {
    if (!current) return;
    void runGeneration({ ...current.request, seed: current.spec.seed });
  }, [current, runGeneration]);

  /**
   * ライブラリから曲を開く。
   * 音声は保存していないので、キャッシュに無ければシードから作り直す。
   * 決定性があるので、いつ作り直してもまったく同じ音になる。
   */
  const handleSelect = useCallback(
    async (meta: TrackMeta) => {
      const cached = getCachedTrack(meta.id);
      if (cached) {
        setCurrent(cached);
        setSeed(cached.spec.seed);
        return;
      }
      setLoadingId(meta.id);
      try {
        // ライブラリ上の同じ曲として扱いたいので、id とタイトルを引き継いで生成する
        const track = await generator.generate(meta.request, {
          id: meta.id,
          title: meta.title,
          createdAt: meta.createdAt,
        });
        if (!track) return;
        setCurrent(track);
        setSeed(track.spec.seed);
      } finally {
        setLoadingId(null);
      }
    },
    [generator],
  );

  const handleRemove = useCallback(
    (id: string) => {
      release(id);
      library.remove(id);
      setCurrent((prev) => (prev?.id === id ? null : prev));
    },
    [library],
  );

  const busy = generator.isGenerating;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-accent-400 to-glow-400 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            sumo
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            プロンプトから楽曲を生成する AI 音楽スタジオ。ブラウザの中だけで動きます。
          </p>
        </div>
        <span className="rounded-full border border-ink-700 px-3 py-1 text-[11px] text-ink-400">
          内蔵シンセ · オフライン生成
        </span>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,300px)]">
        {/* ------------------------------ 作成 */}
        <div className="space-y-4">
          <Panel title="つくる">
            <div className="space-y-4">
              <PromptComposer value={prompt} onChange={setPrompt} disabled={busy} />
              {hints.notes.length > 0 && (
                <div className="rounded-lg border border-ink-700/60 bg-ink-850/50 px-3 py-2">
                  <div className="text-[11px] text-ink-400">プロンプトの解釈</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {hints.notes.map((n) => (
                      <span
                        key={n}
                        className="rounded border border-accent-500/30 bg-accent-600/10 px-1.5 py-0.5 text-[11px] text-accent-400"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <FieldLabel>ジャンル</FieldLabel>
                <GenreGrid value={genre} onChange={setGenre} disabled={busy} />
              </div>

              <div>
                <FieldLabel hint="最大 3 つ">ムード</FieldLabel>
                <TagChips
                  options={MOODS.map((m) => ({ id: m.id, labelJa: m.labelJa }))}
                  value={moods}
                  onChange={setMoods}
                  max={3}
                  disabled={busy}
                />
              </div>

              <div>
                <FieldLabel>入れたい楽器</FieldLabel>
                <TagChips
                  options={INSTRUMENT_TAGS.map((i) => ({ id: i.id, labelJa: i.labelJa }))}
                  value={instruments}
                  onChange={setInstruments}
                  disabled={busy}
                />
              </div>
            </div>
          </Panel>

          <Panel title="詳細設定">
            <div className="space-y-4">
              <ParamControls
                values={params}
                onChange={(v) => setParams((p) => ({ ...p, ...v }))}
                tempoRange={preset.tempo}
                disabled={busy}
              />
              <SeedField seed={seed} onChange={setSeed} disabled={busy} />
            </div>
          </Panel>

          <GenerateBar
            progress={generator.progress}
            onGenerate={handleGenerate}
            onCancel={generator.cancel}
            estimateSec={estimateSec}
          />

          {generator.error && (
            <p className="rounded-lg border border-glow-500/40 bg-glow-500/10 px-3 py-2 text-xs text-glow-400">
              {generator.error}
            </p>
          )}
        </div>

        {/* ------------------------------ 再生 */}
        <div className="space-y-4">
          <Panel>
            {current ? (
              // key を付けて曲ごとに作り直し、再生位置や再生状態を確実にリセットする
              <AudioPlayer
                key={current.id}
                track={current}
                onRegenerateSameSeed={handleRegenerateSameSeed}
              />
            ) : (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ink-700 bg-ink-850">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden
                    className="text-ink-600"
                  >
                    <path d="M13 2.5v7.9a2.5 2.5 0 1 1-1.5-2.29V4.6l-5 1.1v6.3a2.5 2.5 0 1 1-1.5-2.29V3.9l8-1.4Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-ink-300">まだ曲がありません</p>
                  <p className="mt-1 text-xs text-ink-400">
                    左でプロンプトとジャンルを選んで「生成する」を押してください。
                  </p>
                </div>
              </div>
            )}
          </Panel>

          {current?.lyrics && (
            <Panel title="歌詞">
              <LyricsView lyrics={current.lyrics} />
              <p className="mt-3 border-t border-ink-700/60 pt-2 text-[11px] text-ink-400">
                ※ 歌詞はテキストのみの生成です。歌声は合成していません。
              </p>
            </Panel>
          )}

          {current && (
            <Panel title="構成">
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {current.sections.map((s, i) => (
                  <span
                    key={`${s.kind}-${i}`}
                    className="rounded border border-ink-700 bg-ink-850 px-2 py-1 text-ink-300"
                  >
                    {s.labelJa}
                    <span className="ml-1.5 tabular-nums text-ink-600">
                      {Math.round(s.durSec)}秒
                    </span>
                  </span>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* ------------------------------ ライブラリ */}
        <div>
          <Panel
            title="ライブラリ"
            action={
              library.tracks.length > 0 ? (
                <span className="text-[11px] text-ink-400">{library.tracks.length} 曲</span>
              ) : undefined
            }
          >
            <TrackLibrary
              tracks={library.tracks}
              currentId={current?.id ?? null}
              loadingId={loadingId}
              onSelect={(m) => void handleSelect(m)}
              onRemove={handleRemove}
              disabled={busy}
            />
            {library.tracks.length > 0 && (
              <p className="mt-3 border-t border-ink-700/60 pt-2 text-[11px] leading-relaxed text-ink-400">
                音声ではなく生成条件を保存しています。開くときにシードから作り直すので、
                いつでも同じ音が鳴ります。
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
