# レビュー: task-261017151033-unify-scene-animation-loop

## 判定

APPROVED

## 理由・申し送り

- `VRMScene.start()` は通常時に独自RAFと即時描画を行い、XR設定時は `setAnimationLoop` の予約だけを行う。二つの予約経路を統一する目的と、初回動作・更新順を維持する条件は現在の実装・既存テストに一致する。
- 導入済みThree.jsの `WebGLRenderer` はXR開始時に通常予約を停止し、終了時に再開する。[公式仕様](https://threejs.org/docs/pages/WebGLRenderer.html#setAnimationLoop)も描画予約を同APIへ委ねる方法を推奨している（参照日: 2026-10-17）。アプリ側に別の復帰ループを追加せず、予約所有者をレンダラーへ集約できる。
- 継続描画は `updateScene()` の後にキャラクター側で時刻を取得する。ループの引数時刻を渡す変更は、この契約を変えるため避ける。`renderOnce(nowMs)` と省略時の明示時刻取得は既存テストで確認でき、再生関連テストへの影響確認先も示されている。
- Looking Glass側のRAFは入力・配置の復旧であり、継続描画の二重予約とは区別する。通常表示とXR開始・終了の一往復を確認し、実際の予約・復帰失敗を未実施へ置き換えない。実機を使えない場合の扱い、対象外、設計同期先は明確である。コメント品質には [source-comments.md](../../../documents/rules/source-comments.md) を直接適用する。

## 自律補完

- なし。
