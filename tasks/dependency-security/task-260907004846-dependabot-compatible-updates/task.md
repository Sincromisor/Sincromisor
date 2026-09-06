# Dependabot警告の依存更新とNeMo制約の確認

## 背景 / 目的

2026-09-07にGitHub APIで取得した未解決警告35件について、互換性を維持できる依存を更新する。ユーザーの指示に従いNeMo関連の強制更新は避ける。

## 完了条件

- [x] 警告対象を修正版へ更新し、対象の依存解決・ビルド・既存テストで確認する。
- [x] 更新できない警告について、依存制約と再対応条件を記録する。

## 実装方針

Goの間接依存、npmの依存固定ファイル、Pythonの既存制約とuv.lockを対象に、警告修正に必要な更新だけを行う。NeMoと旧音声認識のTransformers制約を調査し、上流の破壊的更新や制約の上書きは行わない。Lightningの修正版表示は説明と整合しないため上流情報を確認する。

## 確認方法

Goの全パッケージのテスト、フロントのビルドと既存テスト、Playwrightの起動確認、Pythonの依存解決と変更範囲の確認を行う。結果と未実行事項は本タスクへ記録する。

## 設計文書

公開契約、構成、動作の変更は予定しないため、設計文書の変更は不要。

## 対応結果

取得コマンド: `gh api --paginate 'repos/Sincromisor/Sincromisor/dependabot/alerts?state=open'`。未解決35件中19件に対応する依存更新を実施した。GitHub上の警告状態は既定ブランチへの反映後に再評価されるため、手動で却下しない。

| 警告番号   | 更新対象                                            | 更新前 → 更新後 |
| ---------- | --------------------------------------------------- | --------------- |
| #196–#208  | `golang.org/x/crypto`                               | 0.48.0 → 0.52.0 |
| #194       | `golang.org/x/net`                                  | 0.50.0 → 0.55.0 |
| #193、#195 | `golang.org/x/image`                                | 0.23.0 → 0.41.0 |
| #192       | `@playwright/test`、`playwright`、`playwright-core` | 1.54.2 → 1.55.1 |
| #212       | `browserslist`                                      | 4.28.2 → 4.28.9 |
| #209       | `postcss-selector-parser`                           | 7.1.0 → 7.1.6   |

Goの依存解決に伴い`golang.org/x/sys`を0.45.0へ、Browserslistの対応ブラウザー情報も更新した。追加の`npm audit`で検出した[fflateの警告](https://github.com/advisories/GHSA-px8p-9vwx-vf98)も0.8.2から0.8.3へ更新した。

## 保留した16件と再対応条件

- `uv.lock`のTransformers: #87、#144、#147、#211。NeMo 2.6.2のASR依存は`transformers~=4.53.0`。`uv lock --dry-run --upgrade-package hydra-core --upgrade-package 'transformers>=5.10.0'`はNeMo 3.0.0への更新と多数の依存変更を伴った。ReazonSpeechとの互換性と実音声認識を確認できるNeMo移行時に再対応する。
- Hydra: #191。NeMoのASR依存は`hydra-core>1.3,<=1.3.2`。[修正版1.3.4](https://github.com/hydra-ecosystem/hydra/releases/tag/v1.3.4)は制約外。`uv lock --dry-run --upgrade-package 'nemo-toolkit==2.6.2' --upgrade-package 'hydra-core>=1.3.4'`で解決不能を再現した。NeMo側の制約更新後に再対応する。
- Lightning: #215。NeMoのASR依存は`lightning>2.2.1,<=2.4.0`。警告説明は2.6.5までの問題とする一方、APIの修正版表示は`2022.6.15`で整合しない。[上流の修正](https://github.com/Lightning-AI/pytorch-lightning/pull/21832)は2026-07-14に取り込まれている。表示値を根拠に古い版へ変更せず、修正を含む配布版とNeMoの対応版を確認して再対応する。
- 旧`speech-recognizer/pyproject.toml`のTransformers: #18、#19、#20、#27、#28、#29、#86、#143、#146、#210。既存コメントに4.52.3で`GPTNeoXAttention.hidden_size`が欠落する不具合が記録され、4.51.3へ固定されている。このサービスはuv workspace外で、依存元の`rinnakk/nue-asr`はGitHub APIで404だった。上流の取得元と修正状況を確認し、nue-asrとDeepSpeedでモデル読み込み・推論が成功した後に再対応する。

上流情報の参照日は2026-09-07。NeMoの制約は配布wheelのMETADATAでも独立確認した。Pythonの依存ファイルは変更していない。これらの脆弱性が解消した、または到達不能とは判定していない。

## 確認結果

- `go mod tidy`: 成功。`go test ./...`: 最終実行で全パッケージ成功。初回は`internal/signaling`の2件がICE収集時間切れとなったが、同パッケージの`-count=1`と全体の再実行は成功した。
- フロントで`npm run build`と`npm run test`: fflate更新後も成功。93ファイル、603テスト成功、1ファイル・2テストは既存のスキップ。
- ルートとフロントで`npm audit --json`: 両方とも警告0件。
- Playwright: `npx playwright install chromium --only-shell`後にNodeから`chromium.launch()`、ページ作成、タイトル取得、終了まで成功。
- `uv lock --check`: 235パッケージの整合性確認成功。試行解決によるPython依存ファイルの変更なし。
- `git diff --check`、変更MarkdownのPrettier確認、タスク状態・索引検査: 成功。
- コメント点検: 本番ソース変更なしのため対象外。

未実行: GPUを用いた実音声認識とサービス全体の実環境試験。Python依存・実装を変更しておらず、今回の依存更新の検証範囲外とした。Pythonの16件は残存リスクとして上記に記録した。
