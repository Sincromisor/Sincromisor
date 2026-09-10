# 月次更新の公開候補（2026-09-10）

公開承認で確認する送信先とイメージ内容を記録する。まだ公開・配布していない。

- ソース: `1f099415eef519b56356bd6f60c0efa1834d6989`
- 履歴タグ: `20260910t131702-1f099415eef5`
- 公開先: `ghcr.io/sincromisor/` の下表8パッケージ。
- 更新するタグ: 上記履歴タグと `latest`。
- 内容: 確定コミットから既存Dockerfileで作成した `linux/amd64` の実行用イメージ。
- ビルド方法: `node scripts/publish-images.mjs build`。全8件成功、全件のソースラベル一致。
- 非公開情報: 作業ツリーの設定・辞書・キャッシュ・接続メモはビルド対象外。追跡中ファイルと非公開接続値の照合は一致ゼロ。
- Python4サービス: 候補イメージの `Config.Cmd` に `--no-sync` があることを確認済み。

以下はローカル候補のイメージIDであり、未取得の配布ダイジェストと混同しない。

| パッケージ               | 候補イメージID                                                            |
| ------------------------ | ------------------------------------------------------------------------- |
| `sincro-frontend`        | `sha256:6e1f4cbe4b3b9162b3cf3aaaee8d04c42823f38ea29f12e0874a62ed38cd7ef9` |
| `redis`                  | `sha256:38df53c383a94e62906690f17deefd8ad6cc172ad790461d1181f77dcba2c654` |
| `sincro-rtc`             | `sha256:d58da21a222cb41bc860f4de7ddc198e1fec15e46ef4f8f264024e1bc90d00b1` |
| `voicevox`               | `sha256:05c09bccde7dc2041c273ec77772bcea53dc289ff1da89b17332e81de02d804e` |
| `speech-extractor`       | `sha256:8f1d99e4929a2f9e34720bc17908a8141d1f8e8115f3f786f12966af5d73c5a7` |
| `speech-recognizer-nemo` | `sha256:c2891d0231f56327336f0ab394ded161a545ea3a5f96d489751f778880328ead` |
| `text-processor`         | `sha256:60036e0480280b289112a6eba6ae0713e2e676576f7db2077ec8640a2b3499da` |
| `voice-synthesizer`      | `sha256:5eda8b62770adeefaf6ce5ffb025fcd60a4095c469bd60e87f85db5acb02154d` |

公開後に配布ダイジェストを取得し、両ホストの取得済みダイジェストと照合する。
公開済みとは判定せず、各ホストへの反映後にPython4サービスの実コマンド、死活確認、会話経路を確認する。
