# 月次更新の公開候補（2026-09-10）

公開承認時に確認した送信先とイメージ内容、および承認後の公開結果を記録する。

- ソース: `1f099415eef519b56356bd6f60c0efa1834d6989`
- 履歴タグ: `20260910t131702-1f099415eef5`
- 公開先: `ghcr.io/sincromisor/` の下表8パッケージ。
- 更新するタグ: 上記履歴タグと `latest`。
- 内容: 確定コミットから既存Dockerfileで作成した `linux/amd64` の実行用イメージ。
- ビルド方法: `node scripts/publish-images.mjs build`。全8件成功、全件のソースラベル一致。
- 非公開情報: 作業ツリーの設定・辞書・キャッシュ・接続メモはビルド対象外。追跡中ファイルと非公開接続値の照合は一致ゼロ。
- Python4サービス: 候補イメージの `Config.Cmd` に `--no-sync` があることを確認済み。

以下は公開候補のローカルイメージIDである。配布ダイジェストは後段へ別記する。

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

承認後に全8件の公開、履歴タグと `latest` のダイジェスト一致、匿名取得を確認した。
両ホストの取得済みダイジェストを照合してから再作成し、実コンテナ9件のソースラベル一致とhealthy、Python4件の `--no-sync` を確認した。

## 公開済み配布ダイジェスト

| パッケージ               | 配布ダイジェスト                                                          |
| ------------------------ | ------------------------------------------------------------------------- |
| `sincro-frontend`        | `sha256:6e1f4cbe4b3b9162b3cf3aaaee8d04c42823f38ea29f12e0874a62ed38cd7ef9` |
| `redis`                  | `sha256:38df53c383a94e62906690f17deefd8ad6cc172ad790461d1181f77dcba2c654` |
| `sincro-rtc`             | `sha256:d58da21a222cb41bc860f4de7ddc198e1fec15e46ef4f8f264024e1bc90d00b1` |
| `voicevox`               | `sha256:05c09bccde7dc2041c273ec77772bcea53dc289ff1da89b17332e81de02d804e` |
| `speech-extractor`       | `sha256:8f1d99e4929a2f9e34720bc17908a8141d1f8e8115f3f786f12966af5d73c5a7` |
| `speech-recognizer-nemo` | `sha256:c2891d0231f56327336f0ab394ded161a545ea3a5f96d489751f778880328ead` |
| `text-processor`         | `sha256:60036e0480280b289112a6eba6ae0713e2e676576f7db2077ec8640a2b3499da` |
| `voice-synthesizer`      | `sha256:5eda8b62770adeefaf6ce5ffb025fcd60a4095c469bd60e87f85db5acb02154d` |

## ホストへの反映

保存済みの復旧用イメージは維持した。各対象は再作成前にセッション0を確認した。

| ホストの役割 | サービス            | 更新前イメージID                                                          | 更新後イメージID                                                          |
| ------------ | ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ローカル     | `sincro-frontend`   | `sha256:9b4e7f00b72f1b9e6e3aae8b6ccaca8a38ff3b75a4421d38f3cefb8dd91eee2a` | `sha256:6e1f4cbe4b3b9162b3cf3aaaee8d04c42823f38ea29f12e0874a62ed38cd7ef9` |
| ローカル     | `sincro-redis`      | `sha256:52fd791d2d921d5df05ccf87d952a5a0ccd878a50e033076c5b2da45deacf450` | `sha256:38df53c383a94e62906690f17deefd8ad6cc172ad790461d1181f77dcba2c654` |
| ローカル     | `sincro-rtc`        | `sha256:52cb6a0c10cf6ec12669d3c7211e0de325ac9b2a8b57a8e88b709f4c1b4617ca` | `sha256:d58da21a222cb41bc860f4de7ddc198e1fec15e46ef4f8f264024e1bc90d00b1` |
| ローカル     | `sincro-voicevox`   | `sha256:93238c0a34c2254a28f157776a977f3084b074f1c36b123e62baf7d981d77bce` | `sha256:05c09bccde7dc2041c273ec77772bcea53dc289ff1da89b17332e81de02d804e` |
| ローカル     | `speech-extractor`  | `sha256:a4da89b818e02640e94aedd78b5f2667c604bfbea59b1f68a565fdd208c1543f` | `sha256:8f1d99e4929a2f9e34720bc17908a8141d1f8e8115f3f786f12966af5d73c5a7` |
| ローカル     | `speech-recognizer` | `sha256:61d046310ff8f2033919e02bd626043a6aef6174475bfe8c1d563c668cb8be1a` | `sha256:c2891d0231f56327336f0ab394ded161a545ea3a5f96d489751f778880328ead` |
| ローカル     | `text-processor`    | `sha256:99e07887275ab540c0697b096c24b3c352ab648e077340660b341aba97df5b7d` | `sha256:60036e0480280b289112a6eba6ae0713e2e676576f7db2077ec8640a2b3499da` |
| ローカル     | `voice-synthesizer` | `sha256:c51e20a60448c83ea3c3791e12c9532f7c99fb83ac6b71d307613565cf484863` | `sha256:5eda8b62770adeefaf6ce5ffb025fcd60a4095c469bd60e87f85db5acb02154d` |
| VPS          | `sincro-rtc`        | `sha256:86b91c4c324eebd3369fd80d28aa64db4a4ef8d975922ae66e90865396128124` | `sha256:d58da21a222cb41bc860f4de7ddc198e1fec15e46ef4f8f264024e1bc90d00b1` |
