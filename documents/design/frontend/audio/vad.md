# フロントエンド VAD

## 要約

- フロント側 VAD はマイク入力の RMS / Peak と学習 VAD を使い、送信ゲートや UI 表示に利用する。
- VAD は UI ではなく音声 / メディア制御の一部として扱う。
- 診断値は診断 Console の音声 / 状態から確認できるようにする。

## 対象範囲

- 対象:
    - フロント側 VAD モード
    - VAD パラメータ
    - 診断 Console 観測項目
- 非対象:
    - サーバー左右 SpeechExtractor
    - 音声認識モデル

## 責務

- `src/features/media/userMedia`
    - マイク / カメラストリーム、機器制約、トラック生存期間、音声プロファイルを置く。
- `src/features/media/vad`
    - Silero VAD 処理担当、学習済み VAD クライアント、音声処理実行時、発話状態を置く。
- `src/features/media/devices`
    - メディア機器リストサービスを置く。
- UserMedia / 音声処理:
    - マイクストリームから音量の包絡線を計算する。
- VAD 状態:
    - 発話中 / 無音 / 不確実などの状態をアプリ制御へ渡す。
- UI:
    - VAD 状態を通常 UI と診断 Console へ表示する。

## モード

- RMS / Peak:
    - 軽量で、即時反応が必要な表示に使う。
- 学習 VAD:
    - ノイズ耐性が必要な発話判定に使う。
- 厳格判定:
    - 誤検出を抑えたい場面で使う。

## 変更時の確認

- VAD パラメータを変更したら診断 Console の表示と設定 UI の文言を確認する。
- 音声機器切替時に VAD 状態が古いストリームを参照していないか確認する。
- サーバー左右 SpeechExtractor の仕様変更とは別文書で扱う。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/frontend_vad.md`
