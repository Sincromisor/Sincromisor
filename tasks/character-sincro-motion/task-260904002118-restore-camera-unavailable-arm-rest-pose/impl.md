# 実装記録

腕の既定角度を `CHARACTER_ARM_REST_POSE` に集約し、旧来の直接書き込み処理と full composer の fallback layer から共有した。上半身の本番書き手は full composer のまま維持している。

## 確認

- 対象単体テストは 2 ファイル、17 テストが成功した。
- `npm run check` が成功した。
- `npm run build` が成功した。既存の大きな chunk に関する警告だけが出た。
- Playwright で `/simple-vrm/` を `sincro` モードへ切り替え、カメラ権限拒否とデバイス未検出の状態でも両腕が下がり、T ポーズにならないことを確認した。

## 変更範囲外の警告

ローカル backend を起動していないため、ブラウザー確認では RTC 設定取得の 404 が発生した。また、設定画面で既存の `Maximum update depth exceeded` が発生した。どちらも本タスクの腕姿勢変更前から独立した経路であり、姿勢確認は完了している。
