# aiortc rollback時の依存解決を不要にする

## 背景 / 目的

Phase 4 の切戻しで `sincro-rtc` を `--no-build --no-deps` で起動すると、
image 内の `uv run` が package 同期を再実行し、`hatchling` をPyPIから取得しようとして
DNS 障害時に起動できなかった。image build 済みの依存だけで起動できるようにする。

## 完了条件

- [ ] `Docker/sincro-rtc/Dockerfile` の実行コマンドが、image build 済みの lockfile と仮想環境を
      利用し、実行時の依存解決を行わない。
- [ ] `sincro-rtc` image をbuild後、ネットワークを使わない実行で
      `RTCSignalingServer.py` が起動することを確認する。
- [ ] `npm run gate` が成功する。

## 変更範囲

- `Docker/sincro-rtc/Dockerfile` の起動コマンド
- 必要最小限の task artifact

## スコープ外

- Python依存の更新、composeの依存順変更、Pionの実装変更

## テスト

既存Docker imageをbuildし、依存同期を禁止した状態で `sincro-rtc` のstatus endpointが応答することを確認する。

## ドキュメント同期

Phase 4 リハーサルの artifact に、切戻し阻害とこの修正taskへの依存を記録する。
