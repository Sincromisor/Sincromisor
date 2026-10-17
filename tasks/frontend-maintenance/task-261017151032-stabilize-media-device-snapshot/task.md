# 機器一覧のスナップショット参照を安定化

## 背景 / 目的

`SincroMediaDeviceService.getSnapshot()` は毎回オブジェクトと配列を複製する。Reactの外部ストアへ移行する前に、サービス内で変更時だけ新しいスナップショットを発行する。

優先度: 中〜低。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

なし。

## 担当範囲と設計判断

- [`src/features/media/devices/sincroMediaDeviceService.ts`](../../../sincromisor-frontend/src/features/media/devices/sincroMediaDeviceService.ts) と対象テストを担当する。読み取り専用の扱いを明確にし、必要な消費側の型調整だけを含める。
- 購読時の現在値通知、機器列挙とdevicechange監視、同時refreshの共有、失敗時の一覧保持・案内を維持する。Reactフックの移行と監視の所有者変更は後続または対象外とする。

## 完了条件

- [x] 状態が変わらない間の取得結果は同じ参照で、更新時だけ置き換える。後の更新で過去のオブジェクト・一覧を変更しない。
- [x] 機器列挙の成功・失敗、再取得中の状態、未対応環境、既存の通知と解除が同じ意味で動作する。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- 型検査とサービス単体の小さなテスト。参照安定性、成功・失敗時の状態、同時refresh、購読解除を既存の機器APIを模した入力で確認する。実機の複数機器対応は追加要件にしない。

## 文書同期

[app-shell.md](../../../documents/design/frontend/app-shell.md) のメディア機器スナップショットについて参照安定性を記す。機器取得・選択の利用者向け仕様は維持する。

## 実施結果

- getSnapshotの複製を除き、一覧と機器情報を読み取り専用として公開した。取得中・失敗時は従来の一覧を保持し、更新時に新しいオブジェクトを発行する。
- 型検査、対象Biome、サービスの2テストが成功。参照安定、古い値の不変性、列挙成功・失敗、同時取得共有、未対応環境、監視と購読解除を確認した。設計を同期した。
