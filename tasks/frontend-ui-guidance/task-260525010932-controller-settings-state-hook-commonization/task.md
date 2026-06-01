# TASK-260525010932 controller settings state hook commonization

- 作成日: 2026-05-25
- ステータス: Done
- 優先度: High
- 関連: `TASK-260525010931`

## 目的

起動前 dialog と simple-vrm 系常設パネルで重複している AppController 購読・settings snapshot hydration・lifecycle / connection state 管理を共通 hook に寄せ、React UI ごとに同じイベント配線を持たない構造にする。

## 背景

- `useSimpleVrmPanelEventState.ts` は controller / settings / runtime event をまとめて購読している。
- `configurationDialogStateGroups.ts` と `configurationDialogEventSubscription.ts` は dialog 用に近い settings / lifecycle / connection 購読を別実装している。
- 既に `subscribeActiveSincroAppEvents()` と snapshot hydrator はあるが、React state の束ね方は画面別に残っている。
- 設定 UI 追加時に、dialog と常設パネルのどちらへイベント反映が必要かを毎回追う必要がある。

## 方針

- AppController 由来の共通状態を `src/app/react/` の hook に切り出す。
- dialog 専用 UI state、常設パネル専用 runtime logs / diagnostics は option で含めるか、別 hook として薄く合成する。
- `subscribeActiveSincroAppEvents()` は継続利用し、購読の入口は増やさない。
- UI 側 hook は「必要な状態を選ぶ」責務に絞る。

## スコープ

- controller / lifecycle / connection / settings / settingsUiState / settingsUiHints / startup status / startup capabilities の共通 hook 化
- active controller 切り替え時の hydrate 処理共通化
- active controller が `undefined` になった時に reset する状態と保持する状態の仕様化
- `useConfigurationDialogSettingsState()` と `useSimpleVrmPanelState()` から共通 hook を利用する
- dialog 専用 `dialogUiState` / `dialogVrmUiState` の扱いを整理する

## 非対象

- Debug console の全状態統合
- AppController event 型の大幅変更
- controller.subscribe の契約変更
- WebRTC 接続フロー変更

## 実装タスク

1. `useSimpleVrmPanelEventState.ts` と `configurationDialogStateGroups.ts` の state / setter / event handler 重複を比較する。
2. `src/app/react/useSincroAppControllerSettingsState.ts` などの共通 hook 名と返却型を決める。
3. active controller が `undefined` になった時の reset / retention matrix を作る。現状の simple-vrm 側は lifecycle を `idle` に戻し、dialog 側は controller だけ外して snapshot を保持する点を確認する。
4. settings 系 event handler を共通化する。
5. active controller 切り替え時の hydration を共通化する。
6. dialog 専用 UI state は共通 hook に option で含めるか、dialog 側 hook で合成する形にする。
7. 常設パネル専用 runtime event state は既存の分割を保ちつつ、controller settings state だけ共通 hook から受け取る。
8. 不要になった重複 type / setter bundle / event switch を削除する。

## 想定変更箇所

- `sincromisor-frontend/src/app/react/useSincroAppControllerSettingsState.ts`
- `sincromisor-frontend/src/app/react/sincroAppStateSnapshotHydrators.ts`
- `sincromisor-frontend/src/pages/simpleVrm/react/useSimpleVrmPanelEventState.ts`
- `sincromisor-frontend/src/pages/simpleVrm/react/useSimpleVrmPanelState.ts`
- `sincromisor-frontend/src/features/dialog/react/configurationDialogStateGroups.ts`
- `sincromisor-frontend/src/features/dialog/react/configurationDialogEventSubscription.ts`
- `sincromisor-frontend/src/features/dialog/react/useConfigurationDialogSettingsState.ts`

## 完了条件

- settings / lifecycle / connection の controller event 反映が共通 hook から行われている。
- 起動前 dialog と常設パネルで同じ settings event handler を別々に保守していない。
- dialog 専用 state と常設パネル専用 diagnostics state の境界が読み取りやすい。
- active controller 切り替え時の初期 hydrate が既存同等に動作する。
- active controller が `undefined` になった時に reset する状態と保持する状態が明文化され、起動前 dialog と常設パネルの既存差分が意図せず変わっていない。

## 確認

- `cd sincromisor-frontend && npm run build`
- 起動前 dialog で設定変更が即時反映されることを確認する。
- simple-vrm / vrm360 / looking-glass-vrm の常設パネルで設定変更と connection 状態表示が更新されることを確認する。
- controller 停止・再開始時に lifecycle / connection 表示が破綻しないことを確認する。
- active controller を外した状態で、settings snapshot / lifecycle / connection / dialog UI state の reset または保持が仕様どおりであることを確認する。

## 実施メモ

- `TASK-260525010931` の設定正本化後に進めると、hook の fallback 値も共通化しやすい。
- runtime logs / RTC diagnostics まで一度に統合しない。まず settings 系の肥大を止める。

## 完了メモ

- `src/app/react/useSincroAppControllerSettingsState.ts` を追加し、controller / lifecycle / connection / settings / settings UI / startup status / startup capabilities の購読と hydration を共通化した。
- simple-vrm 系常設パネルは共通 hook に runtime diagnostics handler を合成し、logs / RTC / VAD / gaze / Looking Glass state だけを画面固有 state として保持する構造にした。
- 起動前 dialog は共通 hook に dialog UI event handler を合成し、dialog UI / VRM UI state だけを画面固有 state として保持する構造にした。
- active controller が `undefined` になった時の仕様は、常設パネルが `lifecycleState` を `idle` に戻し、dialog は lifecycle / connection / settings snapshot を保持する。settings snapshot / startup state は両者とも保持する。
- `configurationDialogStateGroups.ts` と `simpleVrmPanelEventHandlers.ts` から settings 系 setter / event handler の重複を削除した。

## 確認結果

- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
