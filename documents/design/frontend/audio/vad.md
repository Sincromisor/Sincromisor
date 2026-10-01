# フロントエンド VAD

## 要約

- フロント側VADではマイク入力のRMS / Peakと学習VADを使い、判定結果を送信ゲートやUI表示に利用する。
- VADはUIではなく音声 / メディア制御の一部として扱う。
- 診断値は診断Consoleの音声 / 状態から確認できるようにする。

## 対象範囲

- 対象
    - フロント側VADモード
    - VADパラメータ
    - 診断Console観測項目
- 非対象
    - サーバー側のSpeechExtractor
    - 音声認識モデル

## 責務

- `src/features/media/userMedia`
    - マイク / カメラストリーム、機器制約、トラック生存期間、音声プロファイルを置く。
- `src/features/media/vad`
    - Silero VAD処理担当、学習済みVADクライアント、音声処理実行時、発話状態を置く。
- `src/features/media/devices`
    - メディア機器リストサービスを置く。
- UserMedia / 音声処理
    - マイクストリームから音量の包絡線を計算する。
- VAD状態
    - 発話中 / 無音 / 不確実などの状態をアプリ制御へ渡す。
- UI
    - VAD状態を通常UIと診断Consoleへ表示する。

## モード

- RMS / Peak
    - 軽量で、即時反応が必要な表示に使う。
- 学習VAD
    - ノイズ耐性が必要な発話判定に使う。
- 厳格判定
    - 誤検出を抑えたい場面で使う。

## 変更時の確認

- VADパラメータを変更したら診断Consoleの表示と設定UIの文言を確認する。
- 音声機器切替時にVAD状態が古いストリームを参照していないか確認する。
- サーバー側のSpeechExtractorの仕様変更とは別文書で扱う。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/frontend_vad.md`
