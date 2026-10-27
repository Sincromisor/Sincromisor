# フロント再起動時のConsul登録消失を修正する

## 背景 / 目的

`start-caddy.sh` が `sed -i` で原本の置換記号を消すため、同一コンテナを再起動しても登録先が更新されない。
旧IPの死活確認が失敗すると30秒の重大状態後に登録解除対象となり、起動時のみの登録では回復しない。

## 完了条件

- [x] 原本を変更せず、起動時に現在IPを使った登録ファイルを生成する。
- [x] 同じ保存領域でIPを変えて2回起動し、2回目の登録先とIDが更新されることを回帰確認する。

## 変更範囲 / 確認方法

通常の局所変更として `Docker/sincro-frontend/start-caddy.sh` と最小の実行可能な回帰確認を変更する。
既存の公開API、サービス名、Consulの配置、監視対象は維持する。bandogの失敗を無視する変更はしない。
終了コードの初期値欠落も直接範囲として修正する。
設計文書は `documents/design/infrastructure/consul.md` に原本と生成ファイルの責務を記載する。

## 確認結果

2026-09-07、`node --test --test-isolation=none scripts/tests/frontend-consul-registration.test.mjs` と `sh -n Docker/sincro-frontend/start-caddy.sh` が成功した。
回帰確認は2回の正常終了と1回の異常終了を通し、毎回のIP・サービスID・確認URLの更新と原本保持、終了コードの伝搬を確認する。
修正前は同じ確認で正常終了コードが未設定となる失敗も再現した。
