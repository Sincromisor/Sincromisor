# speech-recognizer-nemo

抽出済みの16kHzモノラル音声をNeMoで認識するサービス。責務と設定の接続は[サービス設計](../../documents/design/backend/services/speech-recognizer.md)を参照する。

## テスト

リポジトリのルートで実行する。人工PCM、固定の認識候補、保存先の代替実装を使い、モデルの取得や評価用音声を必要としない。

```sh
uv run --group dev --group speech-recognizer-nemo pytest sincromisor-server/speech-recognizer-nemo/tests
```

この確認は認識精度の実測ではない。実音声による誤認識率、固有名詞の過補正率、GPUでの遅延は別途評価する。

## 固有名詞補正の追跡記録

確定結果を `voice_log_dir` 付きで保存すると、`<session>/<speech_id>_<timestamp>.json` と同じ並びに `.trace.json` が保存される。
`.json` は下流へ返した最終認識結果、`.trace.json` は未補正結果、読み一致補正、保留候補、文脈補強、上位候補の再順位付けの判断を保持する。
辞書の配置は[利用ガイド](../../documents/guides/proper-noun-dictionary.md)、評価観点の原案は[評価タスク](../../tasks/proper-noun-biasing/task-1006-tests-and-evaluation-dataset/task.md)を参照する。
