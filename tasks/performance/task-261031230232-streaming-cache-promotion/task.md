# 逐次音声合成のS3命中をRedisへ昇格する

## 背景と目的

逐次配信の load_cached_voice はRedis未命中・S3命中でもRedisへ保存しない。通常の get_voice と異なり同じ音声を毎回S3から取得する。

## 完了条件

- [ ] 検証済みのS3命中結果を既存のRedis書込みで保存する。
- [ ] 二回目はRedisから取得し、S3取得を繰り返さない。
- [ ] Redis書込み失敗でも取得済み音声を返し、取消時は追加書込みしない。

## 変更範囲

VoiceCacheManager.load_cached_voice と回帰テスト、VoiceSynthesizer設計。保存形式・キー・有効期限・通信形式は維持する。

## 確認方法

人工キャッシュで連続取得・Redis障害・取消・未命中を確認し、既存の逐次配信テストと対象のRuff・型検査を実行する。
