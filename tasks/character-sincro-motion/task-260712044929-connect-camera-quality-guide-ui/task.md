# Connect actionable camera quality guide to sincro UI

## 背景 / 目的

CameraQualityScore は行動可能な guide message を生成済みだが、production sincro のユーザー UI に接続されていない。Phase 3 の「少し下がる／明るくする」案内を表示へつなぐ。

## 完了条件（受け入れ条件）

- [ ] `SincroAppEvent` に `{ type: "camera-quality-changed"; quality: CameraQualityScore; observedAtMs: number }` と `{ type: "camera-quality-reset" }` を追加し、production Pose callback owner が前者、camera停止/talk mode離脱/controller clearが後者を発火する。panel handlerは `PanelCameraGuideState` だけを保持する。
- [ ] sincro tracking 中だけ、最新 `CameraQualityScore.guideMessages` の先頭1件を `diagnosticsStatusCards.tsx` の diagnostics grid直前に置く `CameraQualityGuideCard` に表示する。
- [ ] `good` または message なしでは案内を非表示にし、camera停止・chat mode・tracking reset 時に stale message を残さない。
- [ ] state reducerはeventの`observedAtMs`を唯一のclockにする。非表示→badは即時、非表示→warnは同messageが500ms継続後、表示中は1000ms hold満了後かつ候補messageが500ms継続後に切替える。同status別message/bad→別badも同じ規則、good/messageなし/resetは即時非表示、時刻逆行は候補を破棄して現在表示を維持する。
- [ ] UI 文言は既存 guide message をそのまま使用し、score/reason code を一般ユーザーへ露出しない。diagnostics には従来どおり raw 状態を表示できる。
- [ ] good/warn/bad、message切替、reset、chat mode の component/state tests を追加する。
- [ ] `documents/design/frontend/character/tracking.md` と `app-shell.md` に表示条件と抑制規則を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録し、hysteresis/reset lifecycle と public component contract を対象にする。

## 設計判断（着手前に確定済み）

- 新しい toast system は作らず既存 control panel の状態領域へ出す。継続的な camera guide は一過性通知より状態表示に適する。
- score の閾値を UI で再計算せず `CameraQualityScore` を正本にする。

## スコープ境界

- 本タスク: production UI bridge、1件表示、hysteresis/reset、tests/docs。
- スコープ外: calibration wizard、camera constraint 自動変更、motion-debug viewer、文言の多言語化。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/features/gaze/trackingRuntime/cameraQualityScore.ts:29-40` が status/reasons/guideMessages を一括生成する。
- `sincromisor-frontend/src/pages/simpleVrm/react/components/diagnosticsStatusCards.tsx:19-52` は既存 diagnostics 状態領域だが camera guide input を持たない。
- `sincromisor-frontend/src/pages/simpleVrm/react/useSimpleVrmPanelEventState.ts` の panel event state 境界へ最小の表示 state を追加する。

## テスト

- frontend check / build / test、`npm run gate`、必要なら Playwright で表示/resetを確認、`npm run tasks:check`。

## ドキュメント同期の要否

要。公開 UI 挙動が変わるため tracking と app-shell を同期する。backend/WebRTC契約は変更しない。

## Comment audit / 評価条件

`impl.md` に `path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note` で変更symbol/decision全件を記録する。最低対象は新event payload、発火/reset lifecycle、guide reducer、`CameraQualityGuideCard`。弱い/stale commentはrewrite/delete、省略理由も記録する。評価者は全件を実コード照合し、clock・hold/candidate競合・reset副作用を説明しないcomment、型から明白なcomment、audit不一致をFAILにする。
