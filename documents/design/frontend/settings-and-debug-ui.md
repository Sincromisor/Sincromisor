# 設定と診断UI

## 要約

- 設定 UI は一般ユーザー向け、診断 Console は開発者向け診断として役割を分ける。
- 起動前ダイアログと開始後設定パネルは同じ分類軸を使い、実行時に変更できるものと再開始が必要なものを明確にする。
- 右側ツールパネルは設定と診断 Console を相互排他で表示し、外側装飾は `RightToolFrame` が所有する。

## 対象範囲

- 対象:
    - 起動前設定ダイアログ
    - 開始後設定パネル
    - 右側ツールのメニュー・外枠
    - 診断 Console
- 非対象:
    - RTC 送受信データ
    - VRM 動作アルゴリズム
    - Playwright 確認ログの詳細

## 責務

- `src/features/settings/react`
    - 設定フィールド、基本部品、共通枠組みを置く。
    - `fields` は設定項目入力、`primitives` は表示部品、`shell` はカテゴリ構造を担当する。
- `src/app/settings/sincroAppSettingsDefaults.ts`
    - 起動前ダイアログと設定パネルが共有する設定スナップショット / UI 代替処理の既定値を持つ。
    - DialogStateStore と Looking Glass 実行時設定も同じ既定値を参照する。
- `src/features/dialog`
    - 起動前ダイアログのモデル / サービス / React コンポーネントを置く。
    - 設定フィールド自体は `features/settings` を参照し、ダイアログ固有の状態・通知・VRM 作業手順だけを所有する。
- `src/features/debug`
    - 診断 Console のモデル / 操作部品 / React パネルを置く。
    - RTC / メディア / キャラクター実行時から React デバッグ UI へ直接依存しない。
- `src/app/shell/react/overlay`
    - ダイアログ / 右側ツールの外枠装飾を置く。
- `SettingsShell`
    - 設定カテゴリと本文の情報設計を持つ。
    - 重ね表示フレームや固定位置は持たない。
- `RightToolFrame`
    - 右側ツール領域の位置、幅、z-index、スクロール、閉じるボタン、外側クリック閉じを持つ。
- `StartupDialogFrame`
    - 起動前ダイアログの表示面、背面、余白、スクロールを持つ。
- `DebugConsole`
    - 診断情報スナップショットを表示する。
    - WebRTC / MediaPipe / 音声の生制御を直接所有しない。
    - Sincro Hand は利用可否、由来、ROI 警告、開き具合、信頼度の要約だけを表示し、未加工のランドマークや切り抜きオブジェクトは持たない。

## 情報設計

- 一般設定カテゴリ:
    - `会話`
    - `デバイス`
    - `音声`
    - `表示`
    - `接続`
    - 必要な場合のみ `詳細設定`
- 診断 Console タブ:
    - `Status`
    - `Audio`
    - `Messages`
    - `Gaze`
    - `Sincro`
    - `RTC`
    - `SDP`

## 操作規則

- 設定パネルと診断 Console は同時に大きく重ねない。
- 起動前後の設定は同じ `DialogManager` の一括更新と設定スナップショットを使用する。操作不可の項目と機器ID以外の未指定値は変更せず、機器IDの `undefined` はブラウザー既定への復帰を表す。
- 空の題名は `Sincromisor` へ補正する。題名・機器選択・視線設定に伴う表示更新を終えてから設定変更を一度通知する。Looking Glass設定は従来どおり専用の実行時設定で管理する。
- 閉じるボタン、パネル余白、スクロール、画面幅に応じた表示幅はフレーム側へ寄せる。
- 現在ページで有効な項目がないカテゴリは通常表示しない。
- `Ctrl+Alt+D` は診断 Console の導線として扱う。
- 技術用語が必要な診断情報は診断 Console に置き、通常設定には混ぜない。
- `forceSincroPoseTracking` は低性能端末での姿勢同期デバッグ用設定として扱い、通常利用では `pose_inference_too_slow` の自動降格を優先する。
- Pose 動作の変換調整内に残る姿勢合成処理適用制御は `composerSemanticFingerApplicationMode` だけである。意味に基づく動作 / 指層の抑制を切り分ける開発者切り戻しフラグとして診断 Console に出し、通常設定 UI には出さない。腕、体幹 / 肩、正規化済み姿勢の全面適用の段階別切り戻し操作部品は削除済みであり、利用不可フレームでも診断 Console から旧直接書き込み処理を本番代替処理として起動しない。

## 変更時の確認

- 設定項目を追加したら起動前ダイアログと設定パネルの両方の扱いを決める。
- 既定値を追加・変更したら `sincroAppSettingsDefaults.ts` を正本として更新し、DialogStateStore / 実行時スナップショットに重複値を増やさない。
- 実行時変更可能か、再開始が必要かを文言に反映する。
- 診断 Console に診断項目を追加する場合は、どのスナップショット提供元が責務を持つか確認する。
- 重ね表示外枠の変更は `src/app/shell/react/overlay/*` と `overlay.css` を優先する。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/decisions/ADR-260430-overlay-frame.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
