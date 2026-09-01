# sincro-rtcのパッケージ責務図と試験配置方針を同期

## 背景 / 目的

現行 `README.md` と `documents/design/backend/services/sincro-rtc.md` はサービス全体の責務を示すが、`internal/rtc`、`media`、`signaling`、`pipeline` の実装境界と、どの試験がどの責務を検証するかを案内していない。先行リファクタリング後の入口を正本へ反映する必要がある。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-server/sincro-rtc/README.md` に、実際の最終ディレクトリだけを使った短いパッケージ責務図と、代表的な処理の読み順を記載する。
- [ ] `documents/design/backend/services/sincro-rtc.md` に、シグナリング、セッション、DataChannel、入出力音声、会話パイプライン、観測、起動処理の責務境界を同期する。
- [ ] Goの単体試験は非公開要素を公開せず対象パッケージと同じディレクトリへ置き、独立した本番責務の抽出時は実装と試験を対で移す方針を記載する。
- [ ] 外部結合試験を別ディレクトリへ置くのは公開境界だけで成立する場合に限り、試験移動のための本番要素の公開を禁止する方針を記載する。
- [ ] `documents/design/index.md` の既存導線を確認し、必要な場合だけ更新する。
- [ ] 記載した全パスとリンクが現在の `HEAD` に存在する。

## 設計判断

詳細なファイル一覧や生成される行数表は保守コストになるため置かない。変更理由が異なる主要パッケージと、初見の開発者が次に読む入口だけを正本化する。

## スコープ境界

対象は `sincro-rtc/README.md`、サービス設計文書、必要な索引導線である。本番コード、通信契約、タスク履歴は変更しない。

## 実装方針

全先行タスク完了後の実配置を `rg --files` とパッケージコメントで確認し、重複説明ではなく正本リンクを使って記載する。

## テスト

`cd sincromisor-frontend && npm run check:md`、リポジトリルートで `npm run tasks:check` を実行し、記載パスを `rg --files` で照合する。

## ドキュメント同期の要否

本タスク自体が文書同期である。`frontend-rtc.md` と `audio-pipeline-websocket.md` の契約本文は変更しない。
