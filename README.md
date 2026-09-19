# sumo

プロンプトとジャンルを選ぶと、**ブラウザの中だけで実際に鳴る楽曲を生成する** Suno 風の AI 音楽ジェネレーターです。

API キー・課金・ネットワーク接続はいりません。音楽理論のルール（スケール・コード進行・曲構成）で編曲し、自前のソフトシンセで波形まで書き出します。

## できること

- プロンプト（日本語）とジャンル・ムード・楽器タグから 30〜120 秒の楽曲を生成
- 波形表示・シーク・音量調整つきのプレイヤーで再生
- WAV でダウンロード
- 生成履歴をこの端末に保存し、いつでも同じ音で聴き直し
- シードを指定して、まったく同じ曲を再現
- 歌詞（テキスト）の自動生成 ※ 歌声の合成は行いません

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

## 公開する（GitHub Pages）

サーバー機能を使っていないため、静的書き出しだけで公開できます。`main` に push すると
`.github/workflows/deploy.yml` が走り、<https://isamutakiguchi.github.io/sumo/> に反映されます。

初回だけ、リポジトリの **Settings → Pages → Source** を「GitHub Actions」に変更してください。
マージ前に試したいときは Actions タブから `Deploy to GitHub Pages` を手動実行できます。

手元で同じ成果物を確かめる:

```bash
NEXT_OUTPUT=export npm run build   # out/ に書き出される
npx serve out                      # http://localhost:3000
```

（`NEXT_BASE_PATH` を付けて書き出した `out/` はそのパス直下に置かないと参照が合いません。
手元で確認するときは省略してください。）

`NEXT_OUTPUT=export` を付けないかぎり通常のサーバービルドのままなので、あとから
`app/api/generate/route.ts`（外部 API 用）を足しても設定を戻す必要はありません。
別のパス直下に置くなら `NEXT_BASE_PATH` を変え、ドメイン直下なら省略します。

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

再生だけはブラウザに任せています。WAV の Blob を `<audio>` に渡すことで、シーク・一時停止・音量をブラウザ側の実装で賄え、ダウンロード用の Blob もそのまま使い回せます。

## 外部 AI 音楽 API を使いたい場合

生成バックエンドは `MusicProvider` インターフェース（`lib/providers/types.ts`）で差し替えられます。内蔵シンセが既定の実装で、`lib/providers/remote.ts` が外部 API 用の雛形です。

Replicate の MusicGen や Stable Audio などを使うなら:

1. `app/api/generate/route.ts` を追加し、サーバー側で API を叩く（キーはサーバーの環境変数に置き、クライアントへは渡さない）
2. `lib/providers/remote.ts` の `generate()` を実装する
3. `NEXT_PUBLIC_REMOTE_PROVIDER_ENABLED=1` を設定する

## 構成

```
app/          Next.js App Router（ページはサーバーコンポーネント、中身はクライアント）
components/   UI（作成パネル / プレイヤー / ライブラリ）
lib/
  music/      編曲（音に触らない純粋なロジック）
  audio/      合成・ミックス・WAV 書き出し
  providers/  生成バックエンドの抽象化
  storage/    localStorage への履歴保存とメモリキャッシュ
  hooks/      React フック
```

## 技術スタック

Next.js (App Router) / React / TypeScript / Tailwind CSS。ランタイム依存はこの 3 つだけで、音声ライブラリは使っていません。
