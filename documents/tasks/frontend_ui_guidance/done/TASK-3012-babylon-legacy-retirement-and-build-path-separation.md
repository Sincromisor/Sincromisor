# TASK-3012 legacy build/public 導線の文書同期と `single` / `double` 扱い確定

- 作成日: 2026-04-21
- ステータス: Done
- 完了日: 2026-04-22
- 優先度: High

## 目的

すでに実装済みの `modern 優先ビルド` と `legacy build 分離` を前提に、README・設計文書・公開導線の説明を現状へ同期し、`single` / `double` を含む旧導線の扱いを明文化する。

## 背景

- `package.json` では `build` と `build:all` が分離済みで、`vite.config.js` でも `SINCRO_BUILD_LEGACY=1` により legacy input が隔離されている。
- トップページ `src/index.html` でも、modern 推奨と legacy build 限定利用の案内はすでに入っている。
- したがって、`build/public 導線の分離が未着手` という前提は現状に合っていない。
- 一方で `README.md` では `Single Display` や `Double Display` などが通常導線として読める状態で残っており、利用者向け説明と実装状態にズレがある。
- 未了なのは `build を分けること` ではなく、`分けた結果を文書と導線へ正しく反映すること` である。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3008-frontend-modernization-foundation-and-legacy-retirement.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3009-frontend-support-matrix-and-page-classification.md`

## スコープ

- `build` と `build:all` の役割差の文書同期
- README と設計文書の導線説明更新
- `single` / `double` の扱い確定と文書反映
- 必要に応じたトップページや案内文言の整合調整
- legacy ページを `通常導線` ではなく `検証導線` として扱う説明整理

## 非対象

- `build` / `build:all` 分離の新規実装
- Vite の大規模な再構成
- Babylon.js 依存コードの即時削除
- Looking Glass / 360 系の新規再実装
- コメント整備や CSS 命名規約整備
- `modern / legacy / deprecated` の分類そのものをここで決め直すこと

## 先行条件

- `TASK-3009` の分類結果を前提に、`通常導線` と `legacy 検証導線` の説明を同期する。
- 本タスクでやるのは `build/public 導線の再分類` ではなく、`現行実装と文書のズレ解消` である。

## 対応方針

1. 既存実装がすでに分離している部分は `未着手扱い` に戻さず、残るズレを潰す。
2. README や設計文書は `現在のビルド構成` を正本として追従させる。
3. `single` / `double` は通常導線のまま曖昧に残さず、`legacy`、`deprecated`、`将来再設計候補` のいずれかで扱いを固定する。
4. `build:all` は日常ビルドではなく、legacy 検証用途であることを明示する。

## 整理チェックリスト

### 1. ビルド説明の同期

- [x] `build` と `build:all` の違いが README と設計文書で説明されている
- [x] `SINCRO_BUILD_LEGACY=1` による legacy input 分離が文書上でも読み取れる
- [x] 通常開発時に legacy build を前提にしない運用が整理されている

### 2. 公開導線の整理

- [x] README のページ案内が current state に追従している
- [x] legacy ページを通常利用者向けとして案内しすぎていない
- [x] `src/index.html`、README、設計文書の説明が矛盾していない

### 3. 旧導線の扱い確定

- [x] `single` / `double` の分類と今後の扱いが明文化されている
- [x] `glass` / `character` / `area360` など Babylon legacy 群の位置付けが整理されている
- [x] `TASK-3009` の分類結果と整合している

## 実装タスク

1. `package.json`、`vite.config.js`、`src/index.html` の現状を基準に、README と設計文書でズレている説明を洗い出す。
2. `build` と `build:all` の役割差を README と設計文書へ反映する。
3. `single` / `double` を含む旧導線の扱いを確定し、利用者向け説明へ反映する。
4. 必要に応じてトップページや案内文言を微調整し、modern 優先の導線と整合させる。
5. Babylon.js legacy ページ群を `通常機能` ではなく `検証用途` として扱う説明を同期する。

## 想定変更箇所

- `README.md`
- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- 必要に応じて `sincromisor-frontend/src/index.html`

## 完了条件

- README、設計文書、トップページの説明が現状のビルド構成と一致している
- `build` と `build:all` の役割差が利用者にも開発者にも分かる
- `single` / `double` を含む旧導線の扱いが曖昧でない
- legacy ページが `通常導線` と `検証導線` のどちらか明確に整理されている

## 確認

- `build/public 導線の分離が未着手` という前提に戻っていないことを確認する
- README の案内と `src/index.html` の案内が矛盾していないことを確認する
- `single` / `double` の扱いが、`TASK-3009` の分類結果と整合していることを確認する
- `cd sincromisor-frontend && npm run build` が成功することを確認した
- `cd sincromisor-frontend && npm run build:all` が成功することを確認した

## 実施メモ

- 本タスクは `legacy を通常ビルドから切り離す実装` よりも、`すでに切り離した結果を文書と導線に反映する` ことが主眼である。
- 実装変更に着手した場合は、`documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` の更新が必要になる。
