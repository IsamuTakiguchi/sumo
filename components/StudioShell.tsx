'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GenerationRequest, GenreId, MoodId, Track, TrackMeta, VoiceId } from '@/lib/types';
import { GENRE_PRESETS } from '@/lib/music/genres';
import { INSTRUMENT_TAGS, MOODS } from '@/lib/music/moods';
import { analyzePrompt } from '@/lib/music/prompt';
import { getProvider, LOCAL_SYNTH_ID } from '@/lib/providers';
import { readPassphrase, writePassphrase } from '@/lib/providers/passphrase';
import { forgetTrack, getCachedTrack, pruneAudioTo } from '@/lib/storage/audioCache';
import { useGenerator } from '@/lib/hooks/useGenerator';
import { useLibrary } from '@/lib/hooks/useLibrary';
import { useProviders } from '@/lib/hooks/useProviders';

import { Panel, FieldLabel } from '@/components/ui/primitives';
import { PromptComposer } from '@/components/compose/PromptComposer';
import { GenreGrid } from '@/components/compose/GenreGrid';
import { TagChips } from '@/components/compose/TagChips';
import { ParamControls, type ParamValues } from '@/components/compose/ParamControls';
import { SeedField } from '@/components/compose/SeedField';
import { ProviderPicker } from '@/components/compose/ProviderPicker';
import { PassphraseField } from '@/components/compose/PassphraseField';
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
    lyrics: '',
  });

  const [providerId, setProviderId] = useState(LOCAL_SYNTH_ID);
  // 合い言葉の欄は AI を選んだあとにしか出ないので、初期値の読み出しで
  // ハイドレーションがずれることはない
  const [passphrase, setPassphrase] = useState(readPassphrase);
  const [current, setCurrent] = useState<Track | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [missingAudio, setMissingAudio] = useState<TrackMeta | null>(null);

  const library = useLibrary();
  const generator = useGenerator();

  const providers = useProviders();

  const provider = useMemo(() => getProvider(providerId), [providerId]);
  const needsPassphrase = !provider.supportsSeed;

  const preset = GENRE_PRESETS[genre];
  const hints = useMemo(() => analyzePrompt(prompt), [prompt]);
  // 内蔵シンセは実測で尺の 1/20 ほど。外部 AI はモデル側の待ち時間が支配的
  const estimateSec = provider.id === LOCAL_SYNTH_ID
    ? Math.max(2, Math.round(params.durationSec / 20))
    : 60;

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
      lyrics: params.vocal === 'lyrics' && params.lyrics.trim() ? params.lyrics : null,
      seed,
      providerId,
      ...overrides,
    }),
    [prompt, genre, moods, instruments, params, seed, providerId],
  );

  const runGeneration = useCallback(
    async (req: GenerationRequest) => {
      const track = await generator.generate(req);
      if (!track) return;
      setCurrent(track);
      if (track.spec) setSeed(track.spec.seed);
      library.add(toMeta(track));
    },
    [generator, library],
  );

  const handleGenerate = useCallback(() => {
    void runGeneration(buildRequest());
  }, [buildRequest, runGeneration]);

  const handleRegenerateSameSeed = useCallback(() => {
    if (!current?.spec) return;
    void runGeneration({ ...current.request, seed: current.spec.seed });
  }, [current, runGeneration]);

  /** ライブラリの曲を、id とタイトルを引き継いだまま作り直す */
  const regenerateAs = useCallback(
    async (meta: TrackMeta) => {
      setLoadingId(meta.id);
      try {
        const track = await generator.generate(meta.request, {
          id: meta.id,
          title: meta.title,
          createdAt: meta.createdAt,
        });
        if (!track) return;
        setCurrent(track);
        if (track.spec) setSeed(track.spec.seed);
      } finally {
        setLoadingId(null);
      }
    },
    [generator],
  );

  /**
   * ライブラリから曲を開く。
   *
   * 内蔵シンセの曲は音声を保存していないが、シードから作り直せば波形まで同じ音になる。
   * 外部 AI の曲はそうはいかない。作り直すと**別の曲**になり、そのたびに課金もされる。
   * だから保存してある音声を探し、見つからなければ黙って作り直さず確認を挟む。
   */
  const handleSelect = useCallback(
    async (meta: TrackMeta) => {
      setMissingAudio(null);
      setLoadingId(meta.id);
      try {
        const stored = await getCachedTrack(meta.id);
        if (stored) {
          setCurrent(stored);
          if (stored.spec) setSeed(stored.spec.seed);
          return;
        }
        const from = getProvider(meta.providerId);
        if (!from.supportsSeed) {
          setMissingAudio(meta);
          return;
        }
      } finally {
        setLoadingId(null);
      }
      await regenerateAs(meta);
    },
    [regenerateAs],
  );

  const handleRemove = useCallback(
    (id: string) => {
      void forgetTrack(id);
      library.remove(id);
      setMissingAudio((prev) => (prev?.id === id ? null : prev));
      setCurrent((prev) => (prev?.id === id ? null : prev));
    },
    [library],
  );

  /**
   * 履歴から溢れた曲の音声が端末に残り続けないよう、リストに合わせて掃除する。
   *
   * 空のときは何もしない。localStorage は React の外にあり、最初の描画では
   * サーバー用スナップショット（空配列）が返る。そこで掃除してしまうと、
   * 保存済みの音声を起動直後に全部消すことになる。
   * 個別削除は handleRemove が forgetTrack で消しているので、取りこぼさない。
   */
  const libraryIds = library.tracks.map((t) => t.id).join(',');
  useEffect(() => {
    if (!libraryIds) return;
    void pruneAudioTo(libraryIds.split(','));
  }, [libraryIds]);

  const busy = generator.isGenerating;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-accent-400 to-glow-400 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            sumo
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            {provider.id === LOCAL_SYNTH_ID
              ? 'プロンプトから楽曲を生成する AI 音楽スタジオ。ブラウザの中だけで動きます。'
              : 'プロンプトから楽曲を生成する AI 音楽スタジオ。歌声つきの曲も作れます。'}
          </p>
        </div>
        <span className="rounded-full border border-ink-700 px-3 py-1 text-[11px] text-ink-400">
          {provider.id === LOCAL_SYNTH_ID
            ? '内蔵シンセ · オフライン生成'
            : 'ElevenLabs Music · 約 $0.15/分'}
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
              <ProviderPicker
                providers={providers}
                value={providerId}
                onChange={setProviderId}
                disabled={busy}
              />
              {needsPassphrase && (
                <PassphraseField
                  value={passphrase}
                  onChange={(v) => {
                    setPassphrase(v);
                    writePassphrase(v);
                  }}
                  invalid={generator.needsPassphrase}
                  disabled={busy}
                />
              )}
              <ParamControls
                values={params}
                onChange={(v) => setParams((p) => ({ ...p, ...v }))}
                tempoRange={preset.tempo}
                disabled={busy}
                canSing={!provider.supportsSeed}
              />
              {provider.supportsSeed && (
                <SeedField seed={seed} onChange={setSeed} disabled={busy} />
              )}
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

          {missingAudio && (
            <div className="rounded-lg border border-glow-500/40 bg-glow-500/10 px-3 py-2.5 text-xs leading-relaxed text-glow-400">
              <p>
                「{missingAudio.title}」の音声がこの端末に残っていません。AI で作った曲は
                作り直しても<strong className="font-semibold">同じ音にはならず</strong>、
                あらたに料金がかかります。
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const meta = missingAudio;
                    setMissingAudio(null);
                    void regenerateAs(meta);
                  }}
                  className="rounded border border-glow-500/60 px-2.5 py-1 text-[11px] hover:bg-glow-500/10 disabled:opacity-50"
                >
                  別の曲として作り直す
                </button>
                <button
                  type="button"
                  onClick={() => setMissingAudio(null)}
                  className="rounded border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 hover:border-ink-600"
                >
                  やめる
                </button>
              </div>
            </div>
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
                onRegenerateSameSeed={current.spec ? handleRegenerateSameSeed : null}
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
              {current.providerId === LOCAL_SYNTH_ID && (
                <p className="mt-3 border-t border-ink-700/60 pt-2 text-[11px] text-ink-400">
                  ※ 内蔵シンセでは歌詞はテキストのみの生成です。歌声は合成していません。
                </p>
              )}
            </Panel>
          )}

          {current && current.sections.length > 0 && (
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
                内蔵シンセの曲は生成条件だけを保存し、開くときにシードから作り直します
                （いつでも同じ音）。AI で作った曲は作り直せないので、音声そのものを
                この端末に保存しています。
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
