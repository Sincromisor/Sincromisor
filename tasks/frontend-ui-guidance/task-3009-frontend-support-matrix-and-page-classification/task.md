# TASK-3009 フロントエンドのサポート範囲整理とページ分類

- 作成日: 2026-04-21
- ステータス: Done
- 完了日: 2026-04-21
- 優先度: High

## 目的

`sincromisor-frontend` 内のページ、機能、ビルド導線を `modern / legacy / experimental / deprecated` に分類し、今後の保守対象と退役対象を先に確定する。

## 背景

- `TASK-3008` で整理した通り、現在のフロントエンドは modern 系ページと Babylon.js 系 legacy ページが同居している。
- `single` / `double` / `glass` / `character` / `area360` などは残っているが、通常利用者向け導線として維持するか、検証用途へ縮退するかが曖昧である。
- この判断を後回しにしたまま CSS や React の整理を進めると、互換維持対象が無限に増え、実装方針がぶれやすい。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3008-frontend-modernization-foundation-and-legacy-retirement.md`

## スコープ

- 全ページ、全 HTML エントリ、主要描画経路、主要 UI 導線の棚卸し
- `modern / legacy / experimental / deprecated` の分類表作成
- `single` / `double` の今後の扱いの判断整理
- 通常利用者向け導線と legacy 検証導線の分離方針整理
- README / トップページ / ビルド手順へ反映すべき方針の整理

## 非対象

- CSS 実装そのものの整理
- React コンポーネント構成の変更
- Babylon 依存の削除作業そのもの
- `single` / `double` の新規再実装

## 実施結果

### 1. 分類結果

| ページ              | 分類           | build 導線          | 判断                                               |
| ------------------- | -------------- | ------------------- | -------------------------------------------------- |
| `index`             | `modern`       | `npm run build`     | 公開導線の入口として維持                           |
| `simple-vrm`        | `modern`       | `npm run build`     | 通常会話の正規導線として維持                       |
| `vrm360`            | `experimental` | `npm run build`     | Three.js + VRM1.0 の実験導線として維持             |
| `looking-glass-vrm` | `experimental` | `npm run build`     | Looking Glass の新正規候補として維持               |
| `simple`            | `legacy`       | `npm run build:all` | 旧 simple の比較確認用として短期維持               |
| `glass`             | `legacy`       | `npm run build:all` | 旧 Looking Glass の fallback 検証用                |
| `character`         | `legacy`       | `npm run build:all` | Babylon.js キャラクター描画テスト用                |
| `character-glass`   | `legacy`       | `npm run build:all` | 旧 Looking Glass + character テスト用              |
| `area360`           | `legacy`       | `npm run build:all` | 内部向け 360 実験導線として縮退維持                |
| `single`            | `deprecated`   | `npm run build:all` | 即時凍結。現行 standalone ページとしては保守しない |
| `double`            | `deprecated`   | `npm run build:all` | 即時凍結。現行 standalone ページとしては保守しない |

### 2. `single` / `double` の判断

- `single` / `double` は `deprecated` とし、通常利用者向け導線、通常ビルド、README の主導線から外す。
- CSS 基盤整理や React 境界整理で追従対象にしない。
- 将来レイアウト需要が再発した場合は、`simple-vrm` 系の overlay / scene layout として再設計し、現行 Babylon.js standalone ページは延命しない。

### 3. build / 公開導線の整理方針

- 通常開発・通常確認は `npm run build` を基準にし、`index`、`simple-vrm`、`vrm360`、`looking-glass-vrm` を守る。
- legacy/Babylon.js ページの確認が必要な時だけ `npm run build:all` を使う。
- README は通常利用者向け導線を modern / experimental に寄せ、legacy / deprecated は補足にとどめる。
- トップページは modern / experimental 導線中心を維持し、legacy への直リンクを追加しない。

### 4. 後続タスクへの引き渡し

- `TASK-3010`: CSS 基盤の対象は `index`、`simple-vrm`、`vrm360`、`looking-glass-vrm` に限定する。
- `TASK-3011`: React 境界整理は modern / experimental の 4 ページを優先し、legacy 側の direct manager 依存は縮退対象として扱う。
- `TASK-3012`: README / トップページ / build 手順の導線説明は、本タスクの分類結果を正本として同期する。
- `TASK-3013`: コメント整備は、保守対象の入口と legacy 退役境界が読みにくい箇所に絞る。

## 対応方針

1. まずページと描画基盤を用途ごとに棚卸しし、感覚ではなく一覧ベースで判断する。
2. `残すもの` より先に `通常導線から外す候補` を明確にする。
3. `single` / `double` は `今のまま維持` を既定値にせず、`凍結`、`廃止候補`、`将来再設計` の観点で判断する。
4. ビルド手順と公開導線の差を文書で明示し、通常開発時に legacy を意識しなくてよい状態を目指す。

## 整理チェックリスト

### 1. ページ分類

- [x] 全 HTML エントリが一覧化されている
- [x] 各ページについて、描画基盤、主要用途、利用想定が記述されている
- [x] `modern / legacy / experimental / deprecated` の分類が各ページに付与されている
- [x] `simple-vrm`、`vrm360`、`looking-glass-vrm` を中心とした modern 系の正規導線が明確になっている

### 2. 旧導線整理

- [x] `single` / `double` の扱いが保留ではなく判断候補として整理されている
- [x] `glass` / `character` / `character-glass` / `area360` の扱いが整理されている
- [x] `legacy verification が必要な時だけ build:all を使う` 運用が定義されている
- [x] README とトップページの案内対象を絞る方針がある

### 3. 後続タスク前提の明確化

- [x] CSS 基盤整備で守る対象ページが明確になっている
- [x] React 境界整理で優先するページが明確になっている
- [x] Babylon 退役タスクで通常導線から外す対象が明確になっている

## 実施タスク

1. `sincromisor-frontend/src/**/index.html` と各エントリスクリプトを棚卸しし、ページ一覧を作成した。
2. 各ページについて、描画基盤、UI 基盤、用途、現時点の価値を整理した。
3. 各ページへ `modern / legacy / experimental / deprecated` の分類を付与した。
4. `single` / `double` を `deprecated` とし、即時凍結 + 将来再設計方針で整理した。
5. 通常利用者向け導線と legacy 検証導線の分離方針をまとめた。
6. `README.md`、`documents/design/frontend_ui.md`、`documents/design/frontend_migration_react.md` を更新した。

## 想定変更箇所

- `README.md`
- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3009-frontend-support-matrix-and-page-classification.md`

## 完了条件

- ページ分類表が作成され、保守対象と退役対象が曖昧でない
- `single` / `double` を含む旧導線の扱いが文書化されている
- 通常利用者向け導線と legacy 検証導線の分離方針が定義されている
- 後続の CSS / React / Babylon 整理タスクが、何を対象にすべきか迷わない状態になっている

## 確認

- 分類結果が現在のビルド構成と矛盾していないことを確認する
- 通常利用者向け導線が modern 系ページ中心に整理されていることを確認する
- 後続タスクで守るべき対象と捨ててよい対象が読み取れることを確認する

## 実施メモ

- 本タスクは `何を直すか` の前に `何を守るか` を決めるための前提タスクである。
- 2026-04-21: `frontend_ui.md` をページ分類の正本、`frontend_migration_react.md` を移行優先順位の補助線、`README.md` を利用者向け導線の要約として同期した。
