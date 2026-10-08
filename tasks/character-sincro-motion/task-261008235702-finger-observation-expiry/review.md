# レビュー: task-261008235702-finger-observation-expiry

## 判定

APPROVED

## 理由・申し送り

- `fingerCurlPoseLayer.ts`が診断スナップショットの時刻を毎回更新し、有限な既定の曲げ値を未検出時にも採用する再現済み不具合に対応する。保持期限250ミリ秒、左右別の保持、指ボーンだけを所有する既存契約とも一致する。
- 依存タスクは完了済みで、`SincroMotionClock`、`VRMCharacterManager.update()`、入力系列番号と`SincroVrmPoseComposerService.reset()`による時刻対応・停止・切替・VRM交換時の破棄契約が現行コードと設計文書にある。新しい時計や公開通信契約は不要である。
- Handの有効性は既存の`detected`、`trackingEnabled`、`assignedSide`、`confidence`、警告で判断できる。低信頼の境界は正規化側の既存契約である`0.2`を使えるため、要件を左右する未決定事項はない。
- 完了条件は、観測→欠損→期限超過→復帰、低信頼度、無到着と描画時刻、片手欠損、同時刻再描画、保持中の`curlScale`を対象テストで検証できる。追加撮影・実カメラ・外部通信を必須にせず、保存済み入力がある場合だけ実写確認を行う最小範囲である。
- 実装時は`documents/rules/source-comments.md`を直接適用する。コメント規約をタスク要件として複製・省略していない。

## 自律補完

- `AUTO_FIX`: 有効なHand観測は既存のHand正規化・割当契約に合わせて、`trackingEnabled`、全体と側の`detected`、`source`が`roi`または`full-frame-fallback`、側と要求側の`assignedSide`一致、有限かつ`0.2`以上の`confidence`、`low_confidence`・`landmarks_missing`・`side_inconsistent`・`duplicate_assignment`警告なし、および有限なHand観測時刻で判定する。時刻は`VRMCharacterManager.update()`から渡るHandの表示評価時刻と`SincroHandMotionSnapshot.lastUpdatedAtMs`を同じメディア時計として比較し、時刻欠損時は新たな保持基点を作らない。
