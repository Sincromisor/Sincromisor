# Review: task-260624013712-character-animation-3-canonical-torso-frame-estimator

## 判定

APPROVED

前回 High 指摘だった hip 欠損 fallback と Face yaw hint の未確定は、改訂後の task.md で実装可能な期待値へ固定されています。改訂範囲に、実装を止める新たな High / Critical の破綻は見当たりません。

## 指摘事項

なし

## 実装者への申し送り

- hip world target 欠損時は、`hipCenter` を合成せず、`previous.torso.hipCenter` がある場合だけ引き継ぐ方針に固定されています。`calibration.torsoScale` は `torsoScale` fallback 専用で、synthetic hip center を作らない点に注意してください。
- 前フレームなしの Face yaw hint は `faceForwardHint = normalize([Math.sin(yawRad), 0, Math.cos(yawRad)])`、`Math.abs(yawRad) > Math.PI / 2` または Face 不使用時は `[0, 0, 1]` に固定されています。テストでは Face 未検出 fallback だけでなく、Face yaw hint により候補符号が反転されるケースも追加すると安全です。
- 依存タスク `task-260624013705-character-animation-3-canonical-upper-body-state-contract` の実装後、実際に export された default calibration snapshot の定数名に合わせてください。
