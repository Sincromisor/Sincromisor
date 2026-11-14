# マイク設定変更時に他の音声制約を維持する

## 背景 / 目的

WebRTC実装のモダナイズレビューで挙げた指摘2への対応。2026-11-14、HEAD `0268ee7d9`で関連コードを確認した。

`UserMediaManager`は保持する音声設定を更新するが、`applyAudioBooleanConstraintToTrack`は変更した1項目だけを`applyConstraints()`へ渡す。同APIは制約全体を置き換えるため、例えばエコーキャンセルを無効にした後でノイズ抑制を変更すると、先のエコーキャンセル指定を失う。

模擬トラックで、ノイズ抑制変更時の引数が`{ noiseSuppression: false }`だけになることを確認済み。実機の処理設定が既定値へ戻る挙動は未検証である。利用者の変更対象以外の音声制約を維持する。

## 完了条件（受け入れ条件）

- [x] ノイズ抑制・エコーキャンセル・自動利得調整のいずれを変更しても、更新済み音声設定全体を元のマイクトラックへ適用し、他の指定済み制約を失わない。
- [x] 複数項目を続けて変更した場合も、最後の適用要求が最新の設定全体を含む。適用待ちのトラックから取得した古い制約で設定を巻き戻さない。
- [x] 加工済みトラックへの適用、マイク再取得、RTC再交渉を追加せず、既存の元トラックへ適用する。
- [x] トラック未取得時の`pending`、適用成功時の`applied`、拒否時の`failed`の通知を維持する。
- [x] [設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)へ、実行中の音声設定更新が他の指定を維持することを反映する。

## 設計判断とスコープ

`UserMediaManager`が保持する更新済み設定を適用要求の供給元とする。各要求へ値の写しを渡し、後続の設定変更で送信済み要求の内容が変わらないようにする。既存の音声制約生成処理を再利用できるか確認する。

設定キー・保存形式・音声処理の既定値は変更しない。未対応制約の検出や実際の適用値の表示刷新は対象外とし、今回の制約欠落だけを修正する。RTC通信契約の変更はない。

## 主な変更範囲

- [UserMediaManager](../../../sincromisor-frontend/src/features/media/userMedia/userMediaManager.ts): 更新済み設定全体を適用処理へ渡す。
- [音声制約処理](../../../sincromisor-frontend/src/features/media/userMedia/userMediaConstraints.ts): 制約の保持と適用要求の生成。
- [音声取得処理](../../../sincromisor-frontend/src/features/media/userMedia/userMediaAcquisition.ts): 元トラックの参照と所有関係を確認する。

## 確認方法

- 初期制約にエコーキャンセル・自動利得調整・選択デバイスを含め、ノイズ抑制変更後も他の値が`applyConstraints()`の引数に残ることを確認する。
- 適用Promiseの完了前に別項目を変更する試験で、各要求の独立性と最後の要求に含まれる最新値を確認する。
- 未取得・成功・拒否時の通知を同じ対象試験で確認する。対象の単体試験、型検査、変更したTypeScriptのBiome検査を行う。
- 既存の設定画面からマイク設定を切り替え、元トラックの`getConstraints()`に他の指定が残ることを開発環境で一度確認する。ブラウザー操作には既存のPlaywright利用ルールを適用する。端末・ブラウザーの組み合わせを増やす試験は不要とする。

## 参照仕様

[W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/#constrainable-interface)を2026-11-14に参照した。`applyConstraints()`が既存の制約を新しい制約集合へ置き換える定義を採用する。

## 実装・確認結果

保持する音声設定全体を要求ごとに複製して元トラックへ渡すよう変更した。設定UI設計を同期し、変更箇所と直接の設定更新・適用処理のコメントを点検した。

- `npm run test -- src/features/media/userMedia`: 3件成功。連続変更、入れ子の制約の独立性、未取得・成功・拒否の通知を確認。
- `tsc -p sincromisor-frontend/tsconfig.modern.json`、変更TypeScriptのBiome、変更MarkdownのPrettier: 成功。
- Chromeの模擬マイクと既存設定画面で3項目を連続変更し、元トラックの`getConstraints()`に`echoCancellation: false`、`noiseSuppression: false`、`autoGainControl: true`とサンプルレート等が残ることを確認。実機の音響処理効果は未測定。
