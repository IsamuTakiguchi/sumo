# sumo

プロンプトとジャンルを選ぶと楽曲を生成する Suno 風の AI 音楽ジェネレーターです。生成エンジンを 2 つから選べます。

| | 内蔵シンセ | ElevenLabs Music |
|---|---|---|
| 音の作り方 | 音楽理論のルールで編曲し、自前のソフトシンセで合成 | 学習済みモデルが音声そのものを生成 |
| 歌声 | 出せない（歌詞はテキストのみ） | **歌う**（歌詞を渡せばその通りに） |
| 料金 | 無料 | 約 $0.15/分（60 秒でおよそ 22 円） |
| ネットワーク | 不要。完全にオフライン | 必要。サーバー経由で API を叩く |
| 同じ曲の再現 | シードで**波形まで一致** | できない（毎回違う曲になる） |

内蔵シンセが既定で、API キーを設定した環境でだけ ElevenLabs が選べるようになります。

## できること

- プロンプト（日本語）とジャンル・ムード・楽器タグから 30〜120 秒の楽曲を生成
- 波形表示・シーク・音量調整つきのプレイヤーで再生
- ダウンロード（内蔵シンセは WAV、ElevenLabs は MP3）
- 生成履歴をこの端末に保存し、いつでも聴き直し
- シードを指定して、まったく同じ曲を再現（内蔵シンセのみ）
- 歌詞の自動生成。ElevenLabs では**その歌詞を実際に歌わせられます**

対応ジャンルは ローファイ・ヒップホップ / シティポップ / EDM / ロック / アンビエント / ジャズ / トラップ / シネマティック の 8 種類です。

## 動かす

```bash
npm install
npm run dev     # http://localhost:3000
```

その他のコマンド:

```bash
npm run build      # 本番ビルド
npm run typecheck  # 型チェック
npm run lint       # ESLint
npm run check      # 上記 3 つをまとめて実行
```

## AI 生成（ElevenLabs Music）を使う

**API キーはブラウザに置けません。** ElevenLabs 自身が禁じており、CORS でも弾かれます。
そのため AI 生成にはサーバーが要ります。`app/api/music/route.ts` だけがキーを持ち、
ブラウザからは合い言葉しか送りません。

必要な環境変数は 3 つです（`.env.example` 参照）。

| 変数 | 内容 |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs の API キー。**サーバー専用**。`NEXT_PUBLIC_` を付けないこと |
| `APP_PASSPHRASE` | AI 生成を使うための合い言葉。自分で決める |
| `NEXT_PUBLIC_AI_PROVIDER_ENABLED` | `1` にすると UI に AI の選択肢が出る |

`APP_PASSPHRASE` は飾りではありません。サイトは誰でも開けるので、これが無いと
**見知らぬ人がサイト所有者の API キーで曲を作れてしまいます**。合い言葉が未設定の場合、
サーバーは生成を通さず 503 を返します。尺の上限（120 秒）もサーバー側で強制しているので、
クライアントを改造しても 10 分の曲は作れません。

手元で試す:

```bash
cp .env.example .env.local   # 3 つを埋める
npm run dev
```

## 公開する

公開先は 2 つあります。用途が違うので両方残しています。

### GitHub Pages — 内蔵シンセ専用の無料版

`main` に push すると `.github/workflows/deploy.yml` が走り、
<https://isamutakiguchi.github.io/sumo/> に反映されます。初回だけリポジトリの
**Settings → Pages → Source** を「GitHub Actions」に変更してください。

静的書き出し（`output: 'export'`）なので API ルートは含まれません。したがって
このワークフローでは `NEXT_PUBLIC_AI_PROVIDER_ENABLED` を**設定しないでください**。
設定すると UI に AI の選択肢が出て、選んでも 404 になります。

### Railway — AI 生成つきの版

リポジトリを繋ぐだけで動きます。Railway が Next.js を自動検出し、`npm run build` →
`npm start` を実行します。**`railway.json` も `nixpacks.toml` も要りません。**

1. **New Project → Deploy from GitHub repo** でこのリポジトリを選ぶ
2. **Variables** に上記 3 つを登録する
3. **Settings → Networking → Public Networking → Generate Domain** を押す

3 番目を忘れやすいので注意してください。**Railway は既定で公開ドメインを作りません。**
押すまでは「デプロイは成功しているのに開けない」状態になります。

変数について 2 点:

- 変数は**ビルド時にも渡ります**。`NEXT_PUBLIC_AI_PROVIDER_ENABLED` はビルド時に
  コードへ埋め込まれるので、これで正しく効きます。ただし**あとから足した場合は
  Deploy を押して反映**させてください（Railway では変数の変更が staged changes として溜まります）
- `PORT` は登録不要です。Railway が自動で渡し、`next start` がそれを読みます。
  `package.json` の start に `-p 3000` のような固定ポートを**足さないでください**。
  固定すると「Application failed to respond」になります

料金だけ注意: トライアルの $5 は 30 日で失効し、そのあとの Free プランは月 $1 ぶんの
クレジットしかありません。実用するなら Hobby（$5/月）になります。常駐コンテナなので、
曲を作っていない間も少しずつ消費します。

手元で静的書き出しを確かめる:

```bash
NEXT_OUTPUT=export npm run build   # out/ に書き出される
npx serve out                      # http://localhost:3000
```

（`NEXT_BASE_PATH` を付けて書き出した `out/` はそのパス直下に置かないと参照が合いません。
手元で確認するときは省略してください。）

## 仕組み

生成は一方向のパイプラインです。

```
GenerationRequest    ユーザーが UI で指定した内容
   ↓  lib/music/prompt.ts        プロンプトからジャンル・ムード・テンポを推定
   ↓  lib/music/arrange.ts       シードとジャンル既定を解決して ResolvedSpec に
   ↓  lib/music/structure.ts     イントロ〜アウトロのセクション構成を決める
   ↓  lib/music/harmony.ts       各セクションにコード進行を割り当てる
   ↓  drums / bass / melody / texture   パートごとに音符を書き出す
Arrangement          音に触らない純粋なデータ（JSON）
   ↓  lib/audio/render.ts        ソフトシンセで合成してミックス
StereoBuffer         波形そのもの
   ↓  lib/audio/wav.ts           WAV にエンコード
Track                <audio> で再生し、ダウンロードもできる
```

### 決定性（シード）

`lib/random.ts` の mulberry32 を全体で使い、`Math.random()` は生成パイプラインに一切登場しません（ESLint で機械的に禁止しています）。**シードと設定が同じなら、いつ何度作り直しても波形レベルで同一の曲**になります。

この性質のおかげで、ライブラリには生成条件だけを保存しておけば足ります。60 秒ステレオの WAV は 10MB を超え localStorage（約 5MB）にはそもそも入りませんが、開くときにシードから作り直せば同じ音が返ってきます。

パートごとに `forkRng(seed, 'drums')` のように独立した乱数ストリームを切っているため、ドラムの生成ロジックを変えてもメロディは変わりません。

### メロディの作り方

ランダムな音の羅列にならないよう、4 つのルールを重ねています。

1. 強拍は必ずコードトーンに着地させる
2. 跳躍（4 半音超）の直後は反対方向へ順次進行で戻す
3. セクション内で「上昇 → 頂点 → 下降」のアーチを描く
4. 2 小節のモチーフを作り、繰り返し・変奏する

### 音の合成

サンプル音源は 1 つも使わず、オシレーター・ノイズ・エンベロープ・フィルタだけで 18 種類の音色を作っています（`lib/audio/voices.ts`）。

合成は **Web Audio API ではなく素の JavaScript** で行っています。当初は音符ごとに Web Audio のノードを組み立てていましたが、1 曲で 1 万個近いノードになり、実際の信号処理よりもノードの生成とグラフ走査の固定費がレンダリング時間の大半を占めていました（60 秒の曲で 50〜80 秒）。サンプル単位の計算を自前で回すことでその固定費が消え、**同じ曲が数秒で書き出せる**ようになっています。副次的に、ブラウザ実装の差による音の揺れもなくなりました。

### ミックス

音色そのものの音量は、実測して揃えてあります（`lib/audio/voices.ts` の `LEVEL`）。有音程の音色はすべて `vel=1` で RMS 0.10、打楽器はピーク 1.0 です。こうしておくと**音量バランスはミキサーのゲインだけで決まり**、「音色が大きいのか、フェーダーが上がっているのか」を悩まずに済みます。ジャンルごとのバランスは `lib/music/genres.ts` の `parts[].gain` と `mix` にまとまっています。

マスター段のコンプレッサーは検出側にハイパス（140Hz）を入れてあります。これが無いと、コンプはキックとベースのピークにしか反応せず、低音が鳴るたびに曲全体が沈んで旋律が周期的に埋もれます。最終的な音量合わせもピークではなく RMS 基準です。ピーク基準だと、キックとベースが重なった一瞬が曲全体の音量を決めてしまい、ベースを下げない限り他のパートが大きくなりません。

再生だけはブラウザに任せています。WAV の Blob を `<audio>` に渡すことで、シーク・一時停止・音量をブラウザ側の実装で賄え、ダウンロード用の Blob もそのまま使い回せます。

## 別の AI 音楽 API に差し替える

生成バックエンドは `MusicProvider` インターフェース（`lib/providers/types.ts`）で差し替えられます。
`localSynth.ts` と `elevenlabs.ts` がその実装です。Replicate の MusicGen や Google Lyria など
別のサービスを足すなら:

1. `app/api/music/route.ts` を参考に、サーバー側で叩くルートを追加する
   （キーはサーバーの環境変数に置き、クライアントへは渡さない）
2. `MusicProvider` を実装して `lib/providers/index.ts` の `PROVIDERS` に登録する
3. `supportsSeed: false` にしておくと、音声が自動で IndexedDB に保存されます
   （作り直しでは同じ曲に戻らないバックエンド向けの扱いになります）

### 保存のしかたが 2 通りある理由

内蔵シンセの曲は生成条件だけを localStorage に持ち、開くときにシードから作り直します。
60 秒ステレオの WAV は 10MB を超えて localStorage（約 5MB）には入りませんが、
決定性があるので作り直せば同じ音が返るからです。

AI で作った曲はそうはいきません。**同じ指示でも毎回違う曲になり、作り直すたびに課金されます。**
音声を捨てたら曲そのものが失われるので、こちらだけ実体を IndexedDB に残しています
（`lib/storage/audioStore.ts`）。ライブラリから溢れた曲の音声は自動で掃除されます。

## アイコン

`design/icon/` に元の SVG を置いています。マークは 1 つの `path` で、用途ごとに違うのは
「角丸を付けるか」と「余白をどれだけ取るか」だけです。

| 用途 | ファイル | 元 |
|---|---|---|
| ブラウザのタブ | `app/icon.svg` | `design/icon/icon.svg`（角丸あり） |
| iOS のホーム画面 | `app/apple-icon.png` 180px | `design/icon/apple.svg`（角丸なし。OS が付けるため） |
| PWA | `public/icon-192.png` / `public/icon-512.png` | 512 は `maskable.svg`（端を切られても欠けない余白） |
| SNS のリンクプレビュー | `app/opengraph-image.png` 1200×630 | `design/icon/mark.svg` ＋ 文字 |

`NEXT_PUBLIC_SITE_URL` を設定した環境でだけリンクプレビューが出ます。
**サブパスは入れずにオリジンだけ**を渡してください（`basePath` は Next が別途付けるため、
入れると `og:image` が `/sumo/sumo/...` と二重になります）。

## 構成

```
app/          Next.js App Router（ページはサーバーコンポーネント、中身はクライアント）
  api/music/  ElevenLabs を叩く唯一の場所。API キーはここから外に出ない
components/   UI（作成パネル / プレイヤー / ライブラリ）
lib/
  music/      編曲（音に触らない純粋なロジック）
  audio/      合成・ミックス・WAV 書き出し
  providers/  生成バックエンドの抽象化
  storage/    履歴（localStorage）と音声（メモリ + IndexedDB）
  hooks/      React フック
```

## 技術スタック

Next.js (App Router) / React / TypeScript / Tailwind CSS。ランタイム依存はこの 3 つだけで、音声ライブラリは使っていません。
