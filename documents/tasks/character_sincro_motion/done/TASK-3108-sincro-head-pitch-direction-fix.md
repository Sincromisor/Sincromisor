# TASK-3108 sincro head pitch direction fix

## 背景

`sincro` モードでユーザーの首の上下動を VRM 1.0 キャラクターへ反映した際、上下方向が逆転して見える。

## 対応内容

- MediaPipe FaceLandmarker の pitch を VRM 正規化ボーンの X 回転へ retarget する境界で符号補正した。
- VRM 1.0 の `lookUp` / `lookDown` expression は仕様名どおり扱い、首ボーンの pitch 補正とは責務を分けた。
- 既存の lightweight verification case に pitch 符号の期待値を追加した。

## 確認

- `cd sincromisor-frontend && npm run build`
