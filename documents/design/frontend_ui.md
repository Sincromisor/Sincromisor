# Frontend UI / アプリ制御設計

## 追記メモ（CharacterGaze 改善 / 2026-02-22）

- `CharacterGaze` は複数顔検出時に `FaceTargetSelector` で 1 人を選択して追従する。
  - 切替ヒステリシス（保持時間・切替マージン）により、複数人での迷い挙動を抑制
- keypoint 平滑化は `OneEuroFilter1D` を採用（6 keypoint の x/y）
  - 単純移動平均より、低速時の滑らかさと高速時の追従性を両立
- Debug Console の `Face & Gaze` に `Target` を追加
  - `対象:index / 候補数 / 固定中` を簡易表示して実機チューニングを行いやすくした
- `Face & Gaze` に `Gaze Tuning` を追加
  - 複数人選択（ヒステリシス）と平滑化（One Euro / deadband）の主要パラメータを実行中に調整可能

SincromisorフロントエンドのUI層とアプリ制御層（初期化、RTC連携、表示更新）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/frontend_ui.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-04-25
- ステータス: Active

## 2. 目的とスコープ

- 目的: フロントエンドUI層の画面構成、初期化処理、RTC連携、メッセージ表示の責務を明確化する
- 対象範囲:
  - `sincromisor-frontend/src/ts/SincroController.ts` を中心とした制御
  - UIコンポーネント（Dialog/Chat/Debug/Pop）
  - Vite MPA構成と React app shell
- 非対象範囲:
  - VRMボーン制御や表情制御の詳細（`frontend_character.md` で扱う）
  - サーバー側のシグナリング実装詳細
- LLM向け要約（3-5行）:
  - エントリは `main-vrm.ts`、`vrm360/main-vrm360.ts`、`looking-glass-vrm/main-vrm-looking-glass.ts` を中心とする modern 構成で、`vite.config.js` の build input も `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm` の 4 ページに固定されている。
  - `simple-vrm`、`vrm360`、`looking-glass-vrm` の UI 骨格は `div#sincroPageRoot` 配下の単一 React root に集約され、`src/react/app-shell/SincroPageAppShell.tsx` が dialog / header / chat / telop / debug / settings panel をまとめて描画する。
  - `SincroVRMInitializer` / `SincroVRM360Initializer` / `SincroLookingGlassVRMInitializer` は `SincroAppController` を先行生成し、`start()` 呼び出しでアプリ起動を開始する。
  - `SincroController` は `start()` 内で UserMedia 取得、RTC開始、CharacterGaze開始を統括する。マイク入力 selector の `audioInputDeviceId` は起動時の `getUserMedia` 制約と、実行中の再取得 + `RTCRtpSender.replaceTrack()` の両方へ反映される。視線用カメラ selector の `videoInputDeviceId` は CharacterGaze 専用カメラ取得へ反映され、実行中変更時も preview/AutoMute を維持しながら再初期化される。
  - チャット文は `text_ch`、テロップは `telop_ch` で受信し、`TalkManager` 経由でUI/口形同期に渡す。
  - React への段階移行計画は `documents/design/frontend_migration_react.md` を参照（本書は現行UI設計の正本）。
  - メディアデバイス列挙は `SincroMediaDeviceService` が担当し、`enumerateDevices()` の正規化、ラベル未解決時のフォールバック名生成、`devicechange` 監視を UI から分離する。React UI は `useSincroMediaDeviceState` から snapshot/refresh を購読する。
  - `simple-vrm`, `vrm360`, `looking-glass-vrm` では React 設定パネル（`SimpleVrmControlPanel` 系）に加えて React Debug Console を正式導線として採用している。右側ツール領域の open/close と相互排他は `SincroAppRightToolPanelService` と React menu shell が所有し、React 側は `appController.debug.*` 経由で state と開閉 API を利用する。`DebugConsoleManager` は DOM owner ではなく diagnostics snapshot provider と UI callback bridge として振る舞う。設定パネルと開発者向け診断は同時表示せず、右上の X ボタン、メニュー外/パネル外クリック、`Ctrl+Alt+D` で同じルールに従って切り替える。
  - 2026-04-30 の調査では、起動前 dialog / 右側設定パネル / Debug Console の外側 chrome（surface、close button、z-index、幅、高さ、scroll、backdrop）がまだ共通コンポーネント化されておらず、`TASK-3027` 以降で overlay primitive と right tool frame へ段階的に集約する方針とした。

  - 2026-04-19 時点で設定パネル側の device selector は、起動前 dialog と同じ `audioInputDeviceId` / `videoInputDeviceId` を直接編集する。`useSimpleVrmPanelState` が `useSincroMediaDeviceState` を購読し、`入出力デバイス` カテゴリ内でマイク入力と Gaze 用カメラ selector をまとめて表示する。両UIとも一覧再読み込みと未解決/無効デバイスのヒント表示を共通の考え方でそろえる。`videoInputDeviceId` は `SincroCharacterGazeController` + `VideoInputManager` により CharacterGaze 専用カメラ取得へ直結し、起動時選択・実行中切替・Gaze OFF/ON で再取得/再初期化される。
  - 起動前 dialog の Start 可否は `DialogManager` + `DialogSettingsPolicy` が保持し、`audioInputDeviceId` と `videoInputDeviceId` の選択状態、`enableCharacterGaze`、`getUserMedia` 利用可否を突き合わせて導出する。特に `audioInputDeviceId` が無効な場合、または Gaze 有効中に `videoInputDeviceId` が無効な場合は Start を disabled にし、個別 selector の hint と開始ボタン下の hint の両方で復帰導線を示す。設定パネル / 起動前設定は一般ユーザー向けの設定導線、Debug Console は開発者向けの診断・プレビュー確認導線として分離する。

### 2.1 設定UIの役割分離

- 設定パネル:
  - 一般ユーザーが音声、入力デバイス、キャラクター挙動を調整するためのUIとする
  - ラベルとヘルプは、内部略語ではなく「何が変わるか」「どんな場面で使うか」を優先して記述する
  - 現在のページで使えない項目は通常表示に出さず、意味のない空セクションも作らない
  - 既定状態では、利用頻度の高いカテゴリに短いスクロールで到達できる情報量に抑える
- 起動前設定 dialog:
  - 開始前に決める内容の確認と、開始可否に直結するデバイス選択を担う
  - 常設の設定パネルと同じ分類軸を使い、`会話`、`入出力デバイス`、`音声`、`表示`、`接続` のカテゴリで主要項目をまとめる
  - 「次回反映」「初期化時のみ有効」ではなく、「停止してからもう一度始める」などユーザー行動が分かる文言を使う
- Debug Console:
  - 開発者が WebRTC / Audio / Face & Gaze / SDP を診断するためのUIとする
  - 技術用語や詳細ステータスは維持してよいが、通常の設定導線と誤認しないタイトル、メニュー名、補助文を付ける
  - 既定表示は接続概要などの一次情報を優先し、ログやSDPなどの詳細情報は段階的に辿れる構成とする

### 2.2 右側ツールUIの表示ルール

- ヘッダー右上メニューから開く設定パネルと Debug Console は、同じ「右側ツール領域」に属するUIとして扱う
- 右側ツール領域では、大きな overlay を複数同時に開いて重ねない
  - 設定パネルと Debug Console は相互排他、または同一シェル内のモード切替として扱う
- メニュー操作の結果は、「別のダイアログがもう一枚重なる」ではなく「同じツール領域の内容が切り替わる」と理解できる導線を優先する
- 一般ユーザー向け設定と開発者向け診断は、対象ユーザーと用途が視覚的に区別できる見出し・補助文・情報密度にする
- 右側ツール領域の共通ルール:
  - 閉じる導線は右上の同じ位置に揃える
  - タイポグラフィ、余白、パネル幅、スクロール挙動は可能な限り共通化する
  - 外側クリックで閉じる場合でも、別ツールへの切替操作と誤認しにくい挙動にする
- 設定パネルのカテゴリ表示ルール:
  - 現在のページで有効な項目がないカテゴリは通常表示しない
  - `起動オプション` は対象項目が1件もないページではカテゴリごと表示しない
  - `looking-glass-vrm` のようなページ限定カテゴリは、通常カテゴリと混在させず独立カテゴリとして表示する
- Debug Console の情報表示ルール:
  - 最初に確認したい `Overview` 系情報を先頭に置く
  - `Channels` / `SDP` / 詳細ログは二次情報として扱い、常時全面展開を避ける
  - 監視用UIと実験的な調整UIが混在する場合は、`高度な調整` として分離する

#### 2.2.1 Overlay chrome 共通化方針（2026-04-30）

- 調査背景:
  - `64436a7 Align right tool close buttons` では、右側設定パネルと Debug Console の閉じるボタン位置・見た目を揃えるために、`DebugConsole.tsx`、`RightToolSettingsChrome.tsx`、`sincroDebugConsole.css` を個別に調整した。
  - この修正は症状を解消したが、根本的には「右側ツール領域の外側 chrome」を共通部品として所有する層がないため、今後も close button、panel padding、scrollbar、z-index、responsive 幅の調整が各実装へ散りやすい。
- 現状の分散箇所:
  - `src/react/app-shell/SincroPageAppShell.tsx`: 起動前 dialog、右側設定パネル、Debug Console の mount topology を持つが、共通 overlay frame は持たない。
  - `src/react/dialog/ConfigurationDialog.tsx`: native `<dialog>` の platform boundary と React 設定UIの root を束ねる。
  - `src/react/dialog/configurationDialogSettings.css`: 起動前 dialog の surface / backdrop / SettingsShell override / footer / category card を持つ。
  - `src/styles/sincroConfigurationDialog.css`: legacy layer として `dialog#configurationDialog` の fallback をまだ持つ。
  - `src/styles/sincroDebugConsole.css`: 右側設定パネル、Debug Console、右上 menu、`rightToolCloseButton` の見た目が同居する。
  - `src/react/settings-shell/SettingsShell.tsx`: 設定情報設計の共通 shell だが、overlay 外枠や閉じる導線は責務外である。
- 共通化の単位:
  - `OverlayCloseButton`: close icon、サイズ、focus-visible、hover、disabled、ARIA label 方針を集約する。
  - `OverlayFrame`: surface、border、shadow、padding、scrollbar、safe-area、responsive max size を集約する。
  - `RightToolFrame`: 右側ツール領域の位置、幅、z-index、外側クリック閉じ、設定/診断の相互排他表示を集約する。
  - `StartupDialogFrame`: native `<dialog>` の platform boundary を保ちつつ、dialog surface / backdrop / padding / scroll を共通 token ベースへ寄せる。
- 移行方針:
  - Phase 1 では close button と shared CSS token だけを切り出し、既存 DOM id と操作 API は維持する。
  - Phase 2 では右側設定パネルと Debug Console を `RightToolFrame` 配下へ寄せ、コンテンツ本体と外側 chrome を分離する。
  - Phase 3 では起動前 dialog の frame を整理し、`sincroConfigurationDialog.css` が modern dialog の見た目責務を再び持たない状態へ縮退する。
  - Phase 4 では設定フォーム内の button / field / toggle / help / section card を共通 primitive へ寄せ、inline style と dialog/panel 差分を削減する。
  - Phase 5 では `simple-vrm`、`vrm360`、`looking-glass-vrm` の desktop / mobile overlay 表示を Playwright で確認し、設計文書とタスク結果を同期する。
- 守るべき境界:
  - `SettingsShell` は情報設計とカテゴリナビの共通部品として維持し、overlay frame の責務を追加しすぎない。
  - Debug Console は診断コンテンツ本体、設定パネルは設定コンテンツ本体に寄せ、panel の位置や閉じる導線は frame 側が持つ。
  - `DialogBridgeDomAdapter` は native dialog API と close-interaction 抑止の platform adapter に限定し、見た目調整を戻さない。
  - legacy CSS を修正する場合も、modern React component CSS の責務を取り戻さない。

#### 2.2.2 RightToolFrame 統一結果（2026-04-30）

- `src/react/overlay/RightToolFrame.tsx` が、右側設定パネルと Debug Console の fixed layer、幅、max-height、z-index、scroll container、close button slot、外側クリック閉じを共通管理する。
- `SincroPageAppShell.tsx` は `sincroDebugConsoleContainer` / `sincroReactSettingsPanelContainer` の既存 id を維持しつつ、両方を `RightToolFrame` から描画する。相互排他状態は従来通り `SincroAppRightToolPanelService` の `activePanel` に従う。
- `RightToolMenu` は menu open/close と `Ctrl+Alt+D` の keyboard shortcut を担当し、panel container の visibility や scroll は直接操作しない。
- `DebugConsole` と設定パネル本体は content に専念し、Debug Console の surface / scroll / close button と設定パネルの外側位置指定は frame 側へ移した。

### 2.3 設定シェル方針

- 対象ユーザー:
  - PCで音声通話や配信ツールに慣れた利用者を主対象とし、カテゴリを固定位置から辿れる探索性を重視する
  - 文言は技術用語優先ではなく、「何が変わるか」「次に何をすべきか」が分かる一般ユーザー向け表現を優先する
- 基本構造:
  - 設定UIは `上部ヘッダー + 左カテゴリナビ + 右詳細ペイン` の 2 カラム構成を標準とする
  - 上部ヘッダーには `設定` タイトル、導入説明、画面種別を示す badge を置く
  - 左カテゴリナビは現在地が一目で分かる選択状態を持たせ、カテゴリ探索の主導線とする
  - 左カテゴリナビは最低 `188-220px` 幅を目安とし、通常カテゴリと `開発者向け` を見出しで視覚分離する
  - 右詳細ペインは `ページタイトル / 1文説明 / 設定セクション / フッター操作` の順で構成する
- カテゴリ設計:
  - 一般ユーザー向けの主要カテゴリは `会話`、`入出力デバイス`、`音声`、`表示`、`接続` とする
  - `詳細設定` は一般ユーザーが必要時のみ触る項目をまとめる
  - `開発者向け` は診断や接続パラメータ確認を扱い、通常設定から視覚的・情報密度的に分離する
  - ページ固有設定（例: `Looking Glass 設定`）は通常カテゴリと混在させず、独立カテゴリとして表示する
- 状態表示:
  - 一般カテゴリでは、本文開始位置を揃えるために可変高さの summary ブロックを本文前に置かない
  - 状態表示が必要な場合は、対象セクションや主 CTA の近くへ軽量な面や短い補助文として寄せる
  - 状態表現は色だけに依存せず、`接続済み`、`マイク未検出` のような文言と短い詳細文を併記する
  - 診断用途や Looking Glass のように要約価値が高いページだけ、淡い面表現の status card を本文内に置いてよい
- 操作導線:
  - `WebRTC 開始 / 停止` のような接続アクションは一般設定から分離し、`接続` カテゴリの主操作として扱う
  - 設定変更と即時アクションを同列に並べず、ページごとの主目的に応じて主ボタンを 1 つ選ぶ
  - 保存方式は即時反映を基本とし、再起動や再接続が必要な設定のみ `次回開始時に反映`、`停止してからもう一度始めると反映` などの補助文を出す
- フォーム設計:
  - 説明文は常時長く見せず、見出し直下の 1 文説明と項目ごとの短い補足を基本にする
  - 音声デバイス選択は `現在の選択` と `一覧を更新` を `入出力デバイス` にまとめ、どこで探せばよいかを固定化する
  - 項目量が多いカテゴリは、`使うデバイス`、`前処理`、`開始時のオプション` のようにセクション面を分けて整理する
  - ヘルプは小さな `?` を画面中に散らすより、項目直下の短い説明文または詳細展開に寄せる
- レイアウト/見た目:
  - カテゴリ単位で過剰なカード分割を行わず、`見出し + フォーム + 区切り線` を基本とする
  - 初回セットアップ dialog は `幅 960-1120px`、`高さ 620-780px` を目安とし、左ナビ幅は固定寄りに保ちながら右本文を desktop では `760px` 基準で安定表示する。狭幅では desktop の固定高3段構成を維持せず、`header -> nav -> page -> footer` の 1 カラム積みへ切り替えて dialog 全体をスクロールさせる
  - 開始後の右側設定パネルは `420-560px` 幅を目安とし、本文として読ませる領域を `320px` 未満にしない。開始後オーバーレイで使う `SettingsShell` は viewport 幅ではなくパネル実幅を基準に縮退判定し、右上オーバーレイでも親コンテナの狭さに応じて 1 カラムへ切り替える
  - 起動前 dialog と開始後の設定パネルは、レイアウト差があってもカテゴリ名、項目順、文言方針をそろえる
  - PCでは左ナビを維持し、狭幅時のみドロワーまたはタブへの縮退を許可する
  - 狭幅では、まず左右カラムを縮め、それでも足りない場合に左ナビを上部へ回して主 CTA の視認性を優先する

### 2.4 メインコンテンツの visual 方針

- 対象:
  - `simple-vrm` を main content 設計の正規対象とし、shared shell の変更は `vrm360` / `looking-glass-vrm` にも一貫して反映する
  - 本節でいう main content は、開始後の `header`、`chat`、`telop`、`背景面`、右上ツール導線を指す
- 基本思想:
  - 主役は VRM キャラクター、背景演出、会話体験であり、UI は常時前面に出続けない `content-first` な overlay とする
  - 起動前 dialog、設定パネル、Debug Console ですでに採用している暗色 panel / compact typography / rounded geometry を main content 側にも広げ、起動前後で別製品のように見えない一貫性を保つ
  - `DESIGN.md` は模倣元ではなく、dark surface の役割、情報密度、pill / rounded geometry、elevation の原則を参考にして Sincromisor 用へ翻訳する
- レイヤ設計:
  - 背景 / VRM / 会話UI の優先順位を明確にし、背景コンテンツが読めなくなるほど大きな白面やベタ帯を常設しない
  - `header`、`chat`、`telop` は scene を覆う面ではなく、必要情報だけを浮かせる translucent overlay として設計する
  - 主要 overlay は near-black 系の面を基調にし、アクセント色は active state、focus、選択状態、補助情報など機能用途へ限定する
- main content 各要素の方針:
  - `header` は装飾よりも現在地と主要導線の視認性を優先し、dialog / settings / debug と同じ family に見える dark overlay とする
  - `chat` は scene を塞ぎにくい情報密度を優先し、bubble の面積、余白、最大幅、背景濃度を抑えて可読性と没入感の両立を狙う
  - `telop` は常時フッター帯として主張しすぎないよう、可読性を維持しつつ overlay 化し、背景映像とのコントラストを局所的に確保する
  - 右上ツール導線は設定 panel / Debug Console の見た目と断絶しないトーンにそろえ、`設定だけ新しい / 本体だけ古い` 印象を避ける
- レスポンシブ前提:
  - modern ページでは `meta name="viewport" content="width=device-width, initial-scale=1"` を前提とし、CSS breakpoint と実機表示幅の解釈を一致させる
  - 狭幅時は desktop の見た目を縮小表示するのではなく、overlay の幅、余白、固定帯の高さを減らし、主コンテンツの視認領域を優先する
  - global reset や一括 centering が main content の幅解釈へ副作用を与えないよう、modern UI の見た目責務は component 単位へ寄せる

## 3. 背景

- 解決したい課題:
  - ブラウザ単体で、対話UI・音声I/O・状態確認を一体で扱う
  - モード別UI（simple/legacy/実験系）の共通部品化
- 現状の問題点:
  - React 移行と従来 DOM/UI manager の併存期間があり、責務境界を誤ると回帰しやすい
  - `SincroController` に UI / RTC / CharacterGaze の結線が集中しやすく、段階的なUI差し替え時の境界が見えにくい
- 採用理由:
  - Vite MPA + React app shell により、MPA を維持したまま UI 骨格を共有し、ページ差分を scene と control panel に閉じ込めやすい
- 制約条件:
  - `getUserMedia` 利用のため HTTPS または localhost が前提
  - WebRTCの接続先は `/api/v1/RTCSignalingServer/config.json` の取得結果に依存
  - React段階移行中は、現行UI manager と新UIの併存期間が発生しうる（詳細は `frontend_migration_react.md`）
  - React移行で追加するUIコードは原則 `TypeScript`（`.ts` / `.tsx`）で実装し、props/state/event payload の型を明示する
  - Babylon.js legacy は削除済みであり、今後の UI/ビルド変更は modern ページ群だけを対象にする

### 3.1 サポート範囲とページ分類（2026-04-22）

- 分類ルール:
  - `modern`: 通常利用者向け導線に含め、`npm run build` の対象として継続保守するページ
  - `experimental`: 通常ビルドには含めるが、環境依存や未成熟な制約を明示した上で限定導線として扱うページ
- build 運用:
  - 日常開発・CI 相当の確認は `npm run build` を基準とし、`main`、`simple-vrm`、`vrm360`、`looking-glass-vrm` を守る
  - `npm run build` は `tsc -p tsconfig.modern.json && vite build` を使い、modern 系ソースだけを型チェック対象にする
  - Babylon.js 系の `simple`、`single`、`double`、`glass`、`character`、`character-glass`、`area360` と `main-legacy.ts` は `TASK-3014` で削除済み
- responsive 前提:
  - `simple-vrm`、`vrm360`、`looking-glass-vrm` の HTML 入口には `meta name="viewport" content="width=device-width, initial-scale=1"` を持たせ、desktop / mobile の layout viewport を実機幅に合わせる
  - responsive 確認は `CSS breakpoint が効くこと` と `overlay UI が scene を塞ぎすぎないこと` の両方を基準にする

| ページ | build 導線 | 描画 / UI 基盤 | 主用途 | 分類 | 保守方針 |
| --- | --- | --- | --- | --- | --- |
| `src/index.html` | `npm run build` | 静的トップページ | 公開導線の入口 | `modern` | 通常利用者向けの案内を集約し、legacy への直リンクは置かない |
| `src/simple-vrm/index.html` | `npm run build` | Three.js + VRM1.0 + React UI | 通常会話の正規導線 | `modern` | CSS 基盤、React 境界整理、README の主対象として守る |
| `src/vrm360/index.html` | `npm run build` | Three.js + VRM1.0 + React UI | 360 動画 / カメラ系の拡張導線 | `experimental` | 通常ビルドには含めるが、環境依存前提で検証範囲を限定する |
| `src/looking-glass-vrm/index.html` | `npm run build` | Three.js + VRM1.0 + React UI + `@lookingglass/webxr` | Looking Glass の新正規候補 | `experimental` | public 導線には出すが、対応デバイス前提の実験導線として扱う |

- トップページ導線（2026-04-25）:
  - `src/index.html` は、公開入口として `Simple Interface` を推奨起動モードに置く mode selection dashboard とする。
  - `360deg Camera` と `Looking Glass` は副導線として扱い、`Experimental` / `Device dependent` などの状態ラベルをカード内に明示する。
  - GitHub は起動モード選択を妨げない補助リンクとして header 右側に置き、主要 CTA と同じ重みでは扱わない。
  - トップページも `meta viewport` を持ち、desktop `1280x720` で主要導線と副導線の概要、mobile `390x844` で推奨導線と副導線の存在が初期表示から把握できる compact dashboard を基準にする。
  - 各 mode card には機能概念を示す差し替え可能な SVG 画像を表示し、画像アセットは `public/images/modes/` に分離する。
  - 見た目は `uiFoundation.css` の dark surface / compact typography / pill geometry を使い、main content 側の immersive overlay family と連続させる。

- 後続タスクへの前提:
  - `TASK-3010` の CSS 基盤対象は `index`、`simple-vrm`、`vrm360`、`looking-glass-vrm`
  - `TASK-3011` の React 境界整理対象も同じく modern / experimental の 4 ページを優先する
  - Babylon.js legacy は削除済みのため、以後の UI 整理は modern / experimental の 4 ページに集中する

### 3.2 Mount Topology（2026-04-22）

- `simple-vrm`、`vrm360`、`looking-glass-vrm` は、HTML 側に `div#sincroPageRoot` だけを置き、`main-react.tsx` から `bootstrapSincroPageAppShell()` を呼ぶ
- modern 3 ページの HTML は `meta viewport` を持ち、app shell の responsive 縮退判定が実機幅と一致する前提で運用する
- `src/react/app-shell/SincroPageAppShell.tsx` が、起動前 dialog、ヘッダー、チャット、テロップ、Debug Console、設定パネルの DOM 骨格を一括で描画する
- ページ差分は `SimpleVrmControlPanel` / `Vrm360ControlPanel` / `LookingGlassVrmControlPanel` を app shell へ差し込む形に閉じ、scene 初期化差分は `main-vrm*.ts` と initializer 側へ残す
- `DialogManager`、`TalkManager`、`PopManager` など既存 TS は引き続き DOM id を参照するため、app shell は互換用 id を維持する
- `htmlPartialsPlugin` と `src/partials/*.html` は撤去済みで、mount topology の end state は `MPA のまま、ページごとに単一の React app shell root を持つ` 構成とする

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| MPA | Multi Page Application。Viteで複数HTMLエントリを配信する構成 |
| RTC | WebRTC。Offer/AnswerとDataChannelで通信する |
| CharacterGaze | MediaPipe FaceDetectorを使った顔向き推定機能 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - 設定ダイアログで会話モード・キャラ表示・顔認識・自動ミュート・マイク自動音量調整(AGC)を切替可能
  - 常設設定パネルと Debug Console は右側ツール領域内で重ならず、片方の操作中にもう片方が認知負荷を増やさないこと
  - 開始後の main content は、VRM / 背景演出を主役にした dark overlay UI として表示され、起動前 dialog / 設定パネル / Debug Console と visual family が連続して見えること
  - 起動前設定 dialog と開始後の設定パネルは、`左カテゴリナビ + 右詳細ペイン` の情報設計を共有し、PC利用時に項目を探しやすいこと
  - 起動前設定 dialog は `初回セットアップウィザード` として、本文の読了位置に主 CTA を置き、離脱導線より優先して見えること
  - 常設設定パネルでは、現在のページで設定できる項目がないカテゴリを表示しないこと
  - 常設設定パネルの既定状態で、主要カテゴリへ短いスクロールで到達できること
  - 主要カテゴリは `会話`、`入出力デバイス`、`音声`、`表示`、`接続` を基本とし、`詳細設定` と `開発者向け` を通常設定から分離すること
  - 一般カテゴリでは、カテゴリ切替時に本文開始位置が大きく変わらないよう、本文前に可変高さの summary ブロックを置かないこと
  - 状態表示が必要な場合は、対象セクションや主 CTA の近くへ軽量に配置できること
  - `WebRTC 開始 / 停止` などの接続操作は一般設定項目と混在させず、`接続` カテゴリまたは同等の専用導線に分離すること
  - 設定本文は `カテゴリ見出し + 説明 + セクション面 + フォーム` の繰り返しで読めること
  - 高度なマイク設定を折りたたみ表示（デフォルト閉）とし、必要時のみ詳細項目を操作できること
  - マイク詳細項目として `noiseSuppression` / `echoCancellation` / `autoGainControl` を切替可能であること
  - ローカルマイク入力に高域通過フィルタ(HPF)を適用し、低周波ノイズを抑えられること
  - AudioWorkletベースVADを実行し、DebugConsoleへ `Speech/Silence` 状態を表示できること
  - DebugConsole上でVADのRMS閾値を動的に変更し、判定感度を即時調整できること
  - DebugConsole上でVAD閾値モード（手動/自動追従）を排他的に切り替えられること
  - DebugConsole上で学習VAD（Silero）を有効化し、Web Worker推論結果でVAD判定を上書きできること
  - DebugConsole上でHPF/LPFのカットオフとLPF有効状態を変更し、前段フィルタを動的調整できること
  - 高度設定でVAD送信ゲートを有効化した場合、無音時の送信音量を抑制できること
  - 高度設定で騒音会場モードを有効化した場合、強めの前段フィルタ（HPF+LPF）と高めのVAD初期閾値を適用できること
  - 起動時にマイク/カメラを取得し、音声トラックでRTC接続する
  - `text_ch` / `telop_ch` の受信内容を画面に反映する
  - `header`、`chat`、`telop` の overlay は、狭幅時にも操作や可読性を保ちつつ scene の視認領域を過度に圧迫しないこと
  - デバッグコンソールでICE/SDP/DataChannelログを確認できる
  - デバッグコンソールでローカルマイクのRMS/Peakと、入力状態表示/クリッピング警告を確認できる
  - `RTCPeerConnection.getStats()` を1秒間隔で収集し、主要メトリクスを表示できる
  - 主要メトリクスの直近60秒トレンドをミニグラフで確認できる
  - Debug Console は概要確認と詳細診断を段階的に辿れる構成であること
- 優先度（Must/Should/Could）:
  - Must: RTC接続、チャット表示、テロップ表示
  - Should: 顔認識と自動ミュート、VRMファイル差し替え
  - Could: 実験ページ（Looking Glass/360）

### 5.2 非機能要件

- 性能: UI更新はフレーム落ちを避け、重い処理はrequestAnimationFrameで分散
- 可用性: RTC失敗時は `RTCTalkClient.reConnect()` による再接続を試行
- スケーラビリティ: フロントはクライアント内完結。サーバー側水平分割に依存
- セキュリティ: ブラウザ権限（マイク/カメラ）とCORS/HTTPS前提
- 運用性/保守性: Singleton Managerによる責務分離
- 監視性: DebugConsoleで通信状態・音声レベル・`getStats` メトリクスを可視化
- UX一貫性: 設定パネルと Debug Console は右側ツール領域として見た目と操作規則を揃え、用途の違いは情報密度と文言で区別する
- responsive 一貫性: modern ページは `meta viewport` を前提に layout viewport と CSS breakpoint の解釈を一致させ、desktop 前提の縮小表示に依存しない
- visual 一貫性: main content、起動前 dialog、設定パネル、Debug Console は同じ dark / immersive design family に属し、legacy 由来の白面や過度な帯 UI を段階的に縮退する

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - エントリ: `main-vrm.ts`, `vrm360/main-vrm360.ts`, `looking-glass-vrm/main-vrm-looking-glass.ts`
  - 初期化: `SincroVRMInitializer`, `SincroVRM360Initializer`, `SincroLookingGlassVRMInitializer`
  - 制御: `SincroController`, `RTCTalkClient`, `TalkManager`
  - UI: `DialogManager`, `ChatMessageService`, `DebugConsoleManager`, `PopMessageService`
- 責務分割:
  - 画面入力/設定: DialogManager
  - 通信: RTCTalkClient + SincroRTCConfigManager
  - 表示更新: ChatMessageService/TalkManager/DebugConsoleManager
  - 注: React段階移行に伴い、`SincroController` 直下の結線責務は `App/*Controller` 群へ段階分割予定（`frontend_migration_react.md` 参照）
  - 2026-02-22 時点の分割進捗: `RTC` / `AudioInput` / `CharacterGaze` の結線責務は `App/*Controller` へ抽出済み。`SincroAppController`（`start/stop/subscribe` の最小Facade）導入済み
- 外部依存:
  - Browser APIs: WebRTC, getUserMedia, Fetch, dialog element
  - `@mediapipe/tasks-vision`（顔認識利用時）
- 全体図（必要なら図リンク）:
  - TODO: 図を追加する場合は `documents/design/assets/frontend_ui_overview.drawio` などに配置

### UI責務分類（2026-04-24）

| 区分 | 対象 | 現在の責務 |
| --- | --- | --- |
| manager として維持 | `DialogManager` | 起動前 dialog の設定 state を束ね、store / policy / notification service / DOM adapter をオーケストレーションする |
| manager として維持 | `DebugConsoleManager` | React Debug Console が購読する diagnostics snapshot provider と UI callback bridge を担う |
| service へ改名 | `ChatMessageService` | チャット履歴 snapshot、既存 DOM fallback、React 向けイベント配信を担う |
| service へ改名 | `PopMessageService` | 通常画面 pop の DOM fallback と dialog 内 pop の React 向けイベント配信を担う |
| store | `DialogStateStore` | dialog 設定値 / UI状態 / VRM UI状態 / selected VRM URL の正本を保持する |
| bridge / adapter | `DialogBridgeDomAdapter`, `HeaderTitleDomAdapter` | native dialog API とヘッダー DOM の最小依存だけを隔離する |
| App service | `SincroAppRightToolPanelService` | 右側ツール領域の state owner と開閉ルールを保持する |

### 6.1 入口コメントの棚卸し（2026-04-22）

| 区分 | 対象 | 判断 |
| --- | --- | --- |
| 追加不要 | `src/ts/SincroController.ts`, `src/ts/App/SincroAppController.ts`, `src/ts/SincroVRM/SincroVRMInitializer.ts`, `src/ts/SincroVRM/SincroVRM360Initializer.ts`, `src/ts/SincroVRM/SincroLookingGlassVRMInitializer.ts` | 起動順序、存在意図、UI/RTC/scene の責務境界を示す入口コメントが既にあり、このタスクで増やすと重複ノイズが増える |
| 追加不要 | `src/react/simple-vrm/useSimpleVrmPanelState.ts`, `src/react/dialog/useConfigurationDialogSettingsState.ts`, `src/react/app/subscribeActiveSincroAppEvents.ts`, `src/react/app/useSincroMediaDeviceState.ts`, `src/ts/MediaDevices/SincroMediaDeviceService.ts` | hook / service / bridge utility としての役割、どこへ責務を寄せるかがコメントから追える |
| 追加対象 | `src/ts/main-vrm.ts`, `src/vrm360/main-vrm360.ts`, `src/looking-glass-vrm/main-vrm-looking-glass.ts` | HTML から直接読まれる薄いエントリだが、どのページ群の起動入口で何を initializer へ委譲しているかがファイル単体では分かりにくかった |
| 追加対象 | `src/simple-vrm/main-react.tsx`, `src/vrm360/main-react.tsx`, `src/looking-glass-vrm/main-react.tsx` | 動的 import による React island の mount 入口だが、TS initializer との責務分離とページ別差分の置き場所が読み取りにくかった |

- 本タスクの判断:
  - 追加対象は `main-*` 系の薄い入口に限定し、controller / initializer / hook / service 本体へは広げない。
  - コメントは「何をしているか」の逐次説明ではなく、「どのページから呼ばれ、詳細責務はどこへ委譲しているか」を示す。

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `SincroVRMInitializer`: 初期画面起動、`SincroAppController` 経由の起動/停止配線・dialog bridge 利用、シーン開始
  - `SincroVRM360Initializer`: `VRM360Scene` 初期化に加え、Three.js/VRM1.0 側の Looking Glass 起動ボタン連携（`LookingGlassXRController`）を有効化
  - `SincroController`: UserMedia取得前にダイアログ設定（NS/EC/AGC/騒音会場モード含む）を反映し、RTC開始/停止、DataChannel受信ハンドラ設定、CharacterGaze起動、DebugConsoleのVAD閾値変更をAudioWorkletへ中継
  - `RTCTalkClient`: Offer生成、`/offer` POST、Answer適用、DataChannel管理
  - `TalkManager`: text/telop受信を集約し、チャットUIと口形同期向け状態を維持
  - `DialogManager`: 設定値の参照、タイトル反映、VRMファイル更新時のUI状態/通知（選択中VRM URL を含む状態は `DialogStateStore` に保持し、dialog 本体の native API は React 側 `ConfigurationDialog` + `DialogBridgeDomAdapter`、ヘッダー文言更新は `HeaderTitleDomAdapter` に分離）
  - `DialogVrmFileService`: VRMファイル/サムネイルの Cache Storage 永続化
  - `DialogVrmWorkflowService`: VRMファイル選択/初期復元フロー（検証・保存・復元結果の組み立て）
  - `DialogNotificationService`: dialog 内 Pop 通知の橋渡し（`PopMessageService` ラッパー）
  - `DialogSettingsPolicy`: 設定UIの disabled 状態/Hints と Character/Gaze/AutoMute の有効化ポリシー
  - `SincroMediaDeviceService`: `enumerateDevices()` の結果を `audioinput` / `videoinput` の UI向け選択肢へ正規化し、`devicechange` 監視と選択済み `deviceId` の有効性判定APIを提供
  - `LearnedVadWorkerClient`: 学習VAD Workerの初期化/有効化/チューニング設定/状態通知を管理
  - `UserMediaManager`: `getUserMedia` 制約（`echoCancellation`/`noiseSuppression`/`autoGainControl`/`audioInputDeviceId` 等）を構築し、騒音会場モード切替、HPF/LPF+AudioWorklet VAD処理、手動/自動/学習VAD閾値更新、実行中マイク切替時の再取得を管理
  - `VideoInputManager`: CharacterGaze 専用カメラの取得/再取得/解放を担当し、`videoInputDeviceId` の適用とカメラ切替時の旧トラック停止を集約する
  - `DebugConsoleManager`: React Debug Console が購読する diagnostics core。RTC状態、イベントログ、音声レベルメーター、HPF/LPF・VAD状態/閾値調整・学習VAD状態、60秒トレンドグラフ用 snapshot を保持し、既存 controller からの public API 呼び出し先を維持する
  - `SincroAppRightToolPanelService`: 右側ツール領域の state owner。設定パネルと Debug Console の表示ルール（相互排他、外側クリック閉じ、メニュー遷移の整合）を App/service 側で保持する
  - `SincroAppController.dialogBridge`（`appController.dialog.*`）: dialog 関連 bridge API の集約窓口。React dialog hook / dialog pop / initializer からの呼び出しを段階的に統一
  - `SincroAppController.chatBridge`（`appController.chat.*`）: 挨拶メッセージ出力や system icon 更新など、チャットUI更新の集約窓口（initializer からの `ChatMessageService` 直接依存を縮退）
  - `SincroAppController.debugBridge`（`appController.debug.*`）: Debug Console 操作と右側ツール領域開閉の集約窓口（initializer / React からの `DebugConsoleManager` や tool panel store 直接依存を縮退）
  - `SincroAppController` の bridge 群（`dialog/chat/debug/rtc`）を UI層の主要な呼び出し窓口として段階採用し、manager singleton 直接参照を削減している
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-frontend/src/ts/SincroController.ts`
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-frontend/src/ts/RTC/LearnedVadWorkerClient.ts`
  - `sincromisor-frontend/src/ts/RTC/TalkManager.ts`
  - `sincromisor-frontend/src/ts/UI/DialogManager.ts`
  - `sincromisor-frontend/src/ts/MediaDevices/SincroMediaDeviceService.ts`
  - `sincromisor-frontend/src/ts/UI/ChatMessageService.ts`
  - `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
  - `sincromisor-frontend/src/ts/UI/PopMessageService.ts`
  - `sincromisor-frontend/src/ts/App/SincroAppRightToolPanelService.ts`
  - `sincromisor-frontend/src/ts/RTC/silero-vad.worker.ts`
  - `sincromisor-frontend/src/styles/sincroDebugConsole.css`
  - `sincromisor-frontend/src/react/debug/DebugConsole.tsx`
  - `sincromisor-frontend/src/react/debug/RightToolMenu.tsx`
  - `sincromisor-frontend/src/ts/SincroVRM/LookingGlass/LookingGlassXRController.ts`
- 変更時に同時確認が必要なファイル:
  - RTCペイロード変更: `RTCTalkClient.ts` とサーバー側 `RTCSignalingServer.py`
  - ダイアログ項目変更: `DialogManager.ts` と `src/react/app-shell/SincroPageAppShell.tsx`
  - 起動前 dialog の起動/停止導線変更: `SincroAppController.ts` / `SincroVRMInitializer.ts`
  - 音声入力制約変更: `SincroController.ts` と `RTC/UserMediaManager.ts`
  - チャット表示変更: `ChatMessageService.ts` と `src/styles/sincroChatBox.css`

### 7.1.1 CSS 基盤と legacy 隔離

- 適用対象:
  - `TASK-3009` の分類に従い、CSS 基盤の一次保守対象は `index`、`simple-vrm`、`vrm360`、`looking-glass-vrm` とする
  - 削除済みの Babylon.js legacy ページ向け CSS は追従対象から外し、残存する共通 CSS だけを modern ページの互換レイヤとして扱う
- レイヤ方針:
  - `src/styles/uiFoundation.css` を CSS 基盤の入口とし、`@layer legacy, tokens, foundation, components, utilities;` を宣言する
  - `tokens`: 色、余白、角丸、影、タイポ、z-index の共通トークンを置く。React UI ではハードコード値を増やさず、まず token へ寄せる
  - `foundation`: `box-sizing` や form font 継承のような全体前提だけを置く。ページレイアウトや見た目の主張はここに入れない
  - `components`: `SettingsShell`、`ConfigurationDialogSettingsPanel` など modern React UI の見た目を置く。component root 起点で閉じる
  - `utilities`: 今回は空層のまま予約し、単発の補助 class が本当に必要な時だけ追加する
  - `legacy`: `src/styles/common.css`、`src/styles/sincroConfigurationDialog.css` のような既存 DOM / Babylon 系 CSS を隔離する。cascade 上も modern より弱く保ち、React 側の回避用 `!important` を増やさない
- トークン方針:
  - `DESIGN.md` は dark surface / compact spacing / tactile radius の原則だけを翻訳し、Spotify 風の固有ブランド表現はそのまま持ち込まない
  - token 名は `--sincro-*` で統一し、legacy 互換変数（`--baseTextColor` など）は `common.css` 側で alias する
  - まず共通化するのは `overlay text`、`panel surface`、`border`、`space`、`radius`、`shadow`、`font size` の最小集合に留める
- 命名規約:
  - modern CSS は `componentRoot__element` を基本とし、状態は `is-*` を追加 class で表す
  - root 名は責務で切る。例: `settingsShell*` は共通 shell、`configurationDialogReactSettingsPanel*` は dialog 固有
  - page 名や DOM selector の都合で legacy class / id を残す場合でも、新規の React component CSS へ同じ責務名を持ち込まない
- nesting 利用ルール:
  - legacy CSS では既存保守の都合で nesting を許容するが、既存 selector を崩さない最小修正に留める
  - modern React CSS では nesting を常用しない。root class から 1 段で読める flat selector を基本とし、親状態を拾う必要がある時だけ最小限に使う
  - `tag` 依存や深い子孫 selector による見た目制御は避け、component root から責務を追えることを優先する
- 起動前設定 dialog の責務境界:
  - `src/styles/sincroConfigurationDialog.css` は dialog 要素と legacy fieldset フォールバックの最低限維持だけを担当する
  - `src/react/dialog/configurationDialogSettings.css` は dialog surface、backdrop、dialog 内 pop layer、余白、footer、category card、SettingsShell 上書きなど React 主導 UI の見た目を担当する
  - file picker と drag & drop は `ConfigurationDialogSettingsPanel` の React 正規経路で扱い、`DialogBridgeDomAdapter` は `ConfigurationDialog` から呼ばれる `HTMLDialogElement` の open/close と close-interaction 制御だけに限定する
- CSS ファイル分類:
  - `global foundation`: `src/styles/uiFoundation.css`
  - `modern component CSS`: `src/react/settings-shell/settingsShell.css`, `src/react/dialog/configurationDialogSettings.css`
  - `legacy shared CSS`: `src/styles/common.css`, `src/styles/sincroConfigurationDialog.css`
  - `page / box CSS`: `src/styles/index.css`, `src/styles/simple.css`, `src/styles/sincro*.css`
- Overlay chrome 共通化後の CSS 配置方針:
  - `src/react/overlay/overlay.css`（新設想定）は `OverlayFrame` / `OverlayCloseButton` / `RightToolFrame` / `StartupDialogFrame` の見た目責務を持つ。
  - `configurationDialogSettings.css` は起動前設定 content と dialog 固有 override に寄せ、surface / close button / generic scrollbar は overlay 側へ移す。
  - `sincroDebugConsole.css` は Debug Console content と右上 menu 固有の見た目に寄せ、右側 tool panel の外側 frame と close button を持たない。
  - `sincroConfigurationDialog.css` は legacy fallback と互換維持に限定し、modern page から読み込みを外せる状態を目標にする。
- 後続移行の前提:
  - 新しい設定 UI を追加する時は、まず `SettingsShell` 既存 token を再利用し、足りない値だけ `uiFoundation.css` へ追加する
  - legacy CSS を修正する場合も、`modern component CSS` の見た目責務を取り戻さない
  - 互換保険としての `!important` は原則追加しない。必要なら layer 順序か責務境界の崩れを先に見直す

### 7.2 データ設計

- 主要データ構造:
  - `ChatMessage`（text_ch）
  - `TelopChannelMessage`（telop_ch）
  - `SincroRTCConfig`（offerURL, candidateURL, iceServers）
  - `SincroMediaDeviceSnapshot` / `SincroMediaDeviceOption`（メディアデバイス一覧と選択状態のUI向け正規化結果）
- 永続化対象:
  - ブラウザ側の永続ストレージ利用は基本なし
  - VRMファイル/サムネイルは `DialogVrmFileService` 経由で Cache API（`caches.open('file-cache')`）に保存/読込
- スキーマ/モデル:
  - `sincromisor-frontend/src/ts/RTC/RTCMessage.ts`
- バージョニング方針:
  - サーバーとの契約変更時は前方互換を優先し、必要なら `message_type` 等で吸収
  - `text_ch` の `ChatMessage.expression_code`（表情ヒント）は任意項目として扱い、欠落時は従来どおりチャット表示のみ行う

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - `GET /api/v1/RTCSignalingServer/config.json`
  - `POST {offerURL}`（configで配布）
  - `POST {candidateURL}`（configで配布）
  - DataChannel: `text_ch`, `telop_ch`
- リクエスト仕様:
  - Offer送信: `{ sdp, type, talk_mode, session_id? }`（再接続時は直前 `session_id` で同一セッション更新を試行）
  - Candidate送信: `{ session_id, candidate }`（`candidate` は end-of-candidates のとき `null`）
- レスポンス仕様:
  - Answer: `{ sdp, type, session_id }`
  - Candidate応答: `{ status: true }` または `{ status: false, reason: "session_not_found_or_closed" }`
- エラー仕様:
  - HTTP 429 は明示エラーとして扱う
  - それ以外の非200は再接続対象
- タイムアウト/リトライ方針:
  - Trickle ICE方式: `setLocalDescription`後にOfferを先に送信し、候補は`onicecandidate`で逐次送信
  - `offer.session_id` が有効なら同一セッション更新を優先し、失敗時はサーバー側で新規セッションへフォールバック
  - 接続失敗時は `createOffer({ iceRestart: true })` を利用して再接続する
  - 再接続待機は段階的バックオフ（初回約5秒、指数的に増加、上限60秒、ジッターあり）で制御する
  - 再接続タイマーは単一化し、同時多重再接続を防止する

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - 画面読込 -> 設定ダイアログ表示 -> Start押下
  - UserMedia取得 -> RTC Offer/Answer（session_id取得）-> ICE candidate逐次送信 -> DataChannel open
  - 実行中に `audioInputDeviceId` が変わった場合は、選択デバイスで音声のみ再取得し、`RTCRtpSender.replaceTrack()` で送信トラックを差し替える。Debug Console の Local Mic meter も新トラックへ追従する
  - 実行中に `videoInputDeviceId` または `enableCharacterGaze` が変わった場合は、CharacterGaze 専用カメラを再取得または解放し、`characterGazeVideo` preview / face & gaze preview / AutoMute の入力元を選択カメラへ追従させる
  - `RTCTalkClient` が `getStats()` を1秒間隔で収集し、DebugConsoleへ反映
  - Local/Remote audio track から音声レベルメーターを更新
  - text/telop受信 -> UI更新
- 異常系フロー:
  - 設定取得失敗 -> チャット欄へエラー表示
  - マイク/カメラ取得失敗 -> 起動不可表示またはエラーメッセージ
  - ICE failed -> ICE restart付きOfferで再接続
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: `networking_rtc.md` と整合する図を後続で追加

## 8. 設定・デプロイ

- 環境変数:
  - フロント単体では `.env` 依存は薄く、主にサーバー配布configを利用
- 設定ファイル:
  - `sincromisor-frontend/vite.config.js`（MPA entry と build chunk 設定。modern 4 ページを build input として定義）
  - `sincromisor-frontend/tsconfig.modern.json`（通常 build 用）
- 起動方法:
  - `cd sincromisor-frontend && npm run dev`
- デプロイ/ローカル実行手順:
  - 通常確認: `npm run build`
  - 上記は `tsc -p tsconfig.modern.json && vite build` を実行し、`dist/` に `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm` を出力する
  - `public/mediapipe-wasm` と `public/3rd_party/blaze_face_short_range.tflite` の配置が必要
  - 学習VAD利用時は `public/3rd_party/silero-vad/silero_vad.onnx` の配置が必要（`onnxruntime-web` はnpm依存でバンドル）
- 互換性に影響する設定変更:
  - `config.json` の `offerURL` / `iceServers` 変更は接続性に直結

## 9. 監視・運用

- ログ設計:
  - チャット欄にシステム/エラーを表示
  - デバッグ欄に ICE/SDP/DataChannelログ + RTCイベントタイムラインを表示
  - 再接続時の判定ログ:
    - `start negotiation: forceIceRestart=..., preferredSessionId=...`
    - `send offer: mode=session-update|new-session, targetSessionId=...`
    - `offer update succeeded (...)`
    - `offer fallback detected (...)`
- メトリクス:
  - 1秒間隔で `RTCPeerConnection.getStats()` を収集し、以下を表示
    - Outbound/Inbound audio bitrate
    - Outbound packets sent
    - Inbound packets lost / loss rate / jitter
    - Candidate pair / available outgoing bitrate / RTT
  - 直近60秒トレンドをミニグラフ表示
    - Outbound bitrate（max 256 kbps）
    - Inbound bitrate（max 256 kbps）
    - RTT（max 200 ms）
    - Inbound loss rate（max 5%）
  - Local Mic / Remote RTC の音声レベルメーターを表示
- 障害時の切り分け手順:
  - 1. `/config.json` が取得できるか
  - 2. ICE state が `connected/completed` に遷移するか
  - 3. `text_ch` / `telop_ch` のopenと受信ログが出るか
  - 4. `offer update succeeded` / `offer fallback detected` の発生傾向を確認
  - 5. RTT/loss/jitterトレンドが劣化していないか
- よくある失敗と対処:
  - マイク権限なし: ブラウザ権限を許可
  - 会場ノイズで誤反応が多い: 設定ダイアログの「マイク自動音量調整」をOFFにして再試行
  - WASM未配置: CharacterGazeが起動しない
  - offerURL不整合: POST先エラーで再接続ループ
  - 音声メーターが動かない: ブラウザの自動再生ポリシーにより `AudioContext` が `suspended` のままになっていないか確認

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - ブラウザUI側に独自認証は未実装（上位プロキシ/サービス構成に依存）
- 秘密情報の扱い:
  - フロントに長期秘密情報は保持しない
- 入力検証:
  - VRMアップロード時は拡張子 `.vrm` を最低限検証
- 脅威と対策:
  - XSS対策として通常は `innerText` を使用（必要時のみ `innerHTML`）
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - 起動導線、RTC接続、チャット表示、テロップ表示、設定反映
- 単体テスト:
  - 現状は薄い。主要ロジックは手動確認中心
- 結合テスト:
  - サーバー起動下で Offer/Answer と DataChannel を確認
- E2Eテスト:
  - 手動で `simple-vrm/` を用いた動作確認
- 負荷テスト（必要な場合のみ）:
  - 未整備
- 受け入れ条件:
  - Start後に接続完了メッセージが出て、text/telopが継続受信される

## 12. 既知課題・リスク

- 既知課題:
  - Singleton前提のため、複数インスタンス同時利用には不向き
  - legacyページとの差分が増えると保守コストが増加
- 技術的負債:
  - UIロジックとDOM依存が密結合な箇所がある
- リスク一覧:
  - WebRTC仕様変更時にフロント/サーバー差分が発生しやすい
  - Candidate送信経路（`candidateURL`）が不整合だと接続が成立しない
- 軽減策:
  - `networking_rtc.md` と本書を同時更新する運用を徹底
  - `offerURL`/`candidateURL`/payloadをフロントとサーバーで同時更新する

## 13. 代替案と設計判断

- 検討した代替案:
  - SPA化してルーティング統合
- 採用しなかった理由:
  - 実験ページを含む複数導線を小さく独立管理したい
- 最終判断:
  - MPA継続。共通UI骨格は React app shell で共有し、Manager クラスは既存 DOM id 互換を保ちながら段階縮退する

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |
| 2026-02-15 | ChromiumでのOffer遅延対策として、ICE gathering待機に1500ms上限を設ける仕様を追記 |
| 2026-02-16 | FirefoxでのICE失敗を避けるため、ICE gathering待機をブラウザ別制御（Chromiumのみ1500ms上限）に更新 |
| 2026-02-16 | Trickle ICE導入。`candidateURL`追加、`session_id`付きAnswer、候補の逐次送信フローへ更新 |
| 2026-02-21 | 設定ダイアログにマイク自動音量調整(AGC)の切替を追加し、`getUserMedia` 音声制約へ反映する仕様を追記 |
| 2026-02-21 | 高度なマイク設定（折りたたみ）を追加し、`noiseSuppression`/`echoCancellation`/`autoGainControl` の3項目を起動時に反映する仕様へ更新 |
| 2026-02-21 | DebugConsoleのAudio MonitorにローカルマイクRMS/Peak表示と入力警告（クリッピング/入力小）を追加 |
| 2026-04-22 | `TASK-3018` として HTML partial / `htmlPartialsPlugin` を撤去し、modern 3 ページの UI 骨格を単一 React app shell root へ集約 |
| 2026-02-21 | クライアント音声処理パイプラインにHPF(120Hz)とAudioWorklet VADを追加し、DebugConsoleへSpeech/Silence状態を表示 |
| 2026-02-21 | 高度設定にVAD送信ゲートを追加し、無音時はGainNodeで送信音量を抑制できるよう更新 |
| 2026-02-21 | DebugConsoleにVAD RMS閾値スライダーを追加し、AudioWorkletへ閾値を動的反映できるよう更新 |
| 2026-02-21 | DebugConsoleにVAD閾値の手動/自動追従モードを追加し、Auto時はノイズフロア追従でRMS閾値を更新する仕様へ更新 |
| 2026-02-21 | DebugConsoleに学習VAD（Silero）トグルとモデル状態/確率表示を追加し、Web Workerで推論できる構成へ更新 |
| 2026-02-21 | 学習VAD処理を `LearnedVadWorkerClient` へ分離し、ON/OFF閾値・hangover・推論間隔をランタイム調整可能に更新 |
| 2026-02-21 | 学習VADに負荷/精度プリセット（低負荷/標準/高精度）を追加し、会場運用時に一括調整できるよう更新 |
| 2026-02-21 | DebugConsoleにHPF/LPF設定（HPF cutoff・LPF有効化・LPF cutoff）を追加し、前段フィルタを動的反映できるよう更新 |
| 2026-02-21 | DebugConsoleにVAD RMS閾値プリセット（標準/騒音環境/超騒音環境）を追加し、ワンクリックで適用可能に更新 |
| 2026-02-21 | 高度設定に騒音会場モードを追加し、HPF強化(180Hz)+LPF(4.2kHz)+高めのVAD初期閾値を起動時に適用できるよう更新 |
| 2026-02-21 | DebugConsole UIをカード型レイアウトへ刷新。Session/Transport/Audio/Channel/Gaze/SDPの監視パネルを追加 |
| 2026-02-21 | `getStats()` の1秒収集による主要メトリクス表示と、直近60秒ミニグラフ（固定上限スケール）を追加 |
| 2026-02-21 | 再接続仕様を更新。ICE restart明示のOffer再送と、指数バックオフ（上限60秒・ジッター付き）を追加 |
| 2026-02-21 | `offer.session_id` による同一セッション更新（失敗時は新規セッションフォールバック）を追加 |
| 2026-02-21 | 同一セッション更新の挙動を追跡するため、再接続時の判定ログ（更新成功/フォールバック）を追記 |
| 2026-02-22 | 起動前 dialog を React 主導 + bridge 最小構成へ移行。`DialogStateStore`/`DialogBridgeDomAdapter`/`DialogSettingsPolicy`/`DialogEventHub`/`Dialog*Service` 群で責務分離し、呼び出し側は `SincroAppController` の `dialog/chat/debug/rtc` bridge API を利用する構成へ更新 |
| 2026-02-22 | `SincroAppTypes.ts` を追加して AppController 型/イベント定義を分離。React 側の dialog 操作は `DialogManager` 直接参照を使わず `SincroAppController.dialog` 経由に統一 |
| 2026-02-22 | `SincroAppEventMappers.ts` に managerイベント→Appイベント変換を分離し、`SincroAppController` の購読処理を `bindManagerSubscriptions()` に整理 |
| 2026-02-22 | Looking Glass の UI表示向け状態管理を `SincroAppLookingGlassStateTracker.ts` へ分離し、`SincroAppController` はイベント受信/通知順の制御に集中する構成へ更新 |
| 2026-02-22 | `SincroAppConnectionState.ts` / `SincroAppSettingsApply.ts` / `SincroAppBridgeFactories.ts` を追加し、AppController の接続状態判定・設定反映・bridge実装を helper/factory へ分離 |
| 2026-02-22 | `SincroAppStartupSettings.ts` / `SincroAppSubscriptionSnapshot.ts` を追加し、AppController の startup設定判定と初期購読スナップショット送出を helper 化 |
| 2026-02-22 | `SincroAppSettingsSnapshotBuilder.ts` / `SincroAppWindowEventBinder.ts` を追加し、AppController の settings snapshot 合成・window event 登録を helper 化。未使用の互換 wrapper を整理して bridge API（`appController.dialog/chat/debug/rtc`）中心へ寄せた |
| 2026-02-22 | `SincroAppUiStateSnapshotBuilder.ts` を追加して Dialog由来UI状態の取得を helper 化。AppController の manager購読配線を機能別メソッド（chat/debug/talk/pop/dialog）に分割し可読性を改善 |
| 2026-02-22 | `SincroAppEventHub.ts` / `SincroAppControllerRuntime.ts` を追加し、AppController の AppEvent listener 管理と constructor 初期化（manager bundle / bridge bundle 作成）を helper 化。UI状態 getter は `getUiStateSnapshot()` 経由に整理 |
| 2026-02-22 | `SincroAppActiveControllerRegistry.ts` / `SincroAppLookingGlassEventFlow.ts` を追加し、AppController の static active controller 管理と Looking Glass window event handler 本文を helper 化。public API はセクションコメントで整理 |
| 2026-02-22 | `SincroAppDialogFacade.ts`（Dialog 境界型）と `SincroAppEmitHelpers.ts`（lifecycle/settings snapshot emit）を追加。React 側は `subscribeActiveSincroAppEvents.ts` で active controller + event購読の定型配線を共通化 |
| 2026-02-22 | `SincroAppDebugSubscriptionFlow.ts` で debug購読の RTC/connection state 更新手順を helper 化。`SincroAppController.state` bridge を追加して snapshot getter 群を grouping。`useSimpleVrmPanelState` の AppEvent 処理は handler map 化して保守性を改善 |
| 2026-02-22 | `useConfigurationDialogSettingsState` も AppEvent handler map 化し、`appController.state` から初期/差し替え時 snapshot を取得する構成へ整理。AppController の manager購読配線には emit順序意図のコメントを補強 |
| 2026-02-22 | `sincroAppStateSnapshotHydrators.ts` で React hook 間の snapshot 反映処理を共通化。`SincroAppManagerSubscriptionBinder.ts` で AppController の manager購読本文（chat/debug/talk/pop/dialog）を helper 化し、Controller 本体を orchestration 中心に整理 |
| 2026-02-22 | `SincroAppManagerSubscriptionFacades.ts` で manager購読binderの依存境界を facade 型として明文化。React 側は `panelLogHelpers.ts` で chat/system/error ログ追加処理を共通化。AppController constructor は `initializeRuntime()` へ分割して読み順を改善 |
| 2026-02-22 | `SincroAppControllerRuntimeBundle` 型を追加して AppController `initializeRuntime()` の返却型を明示。`panelLogHelpers.ts` の汎用先頭追加 helper は `DialogPopMessages.tsx` にも適用し、dialog pop 更新処理の共通化を前進。`SincroAppManagerSubscriptionBinder.ts` の debug購読には emit順序意図コメントを追加 |
| 2026-02-22 | `dialogPopAnimationHelpers.ts` で dialog pop の show/hide/remove タイマー処理を helper 化。`SincroAppLookingGlassEventFlow.ts` は flow 用 params 型/ラッパーを追加して LG event handler 境界を明確化。AppController `initializeRuntime()` は `createSincroAppRuntimeBundle(...)` を利用し、runtime bundle 組み立て（manager + bridge + stateBridge）を `SincroAppControllerRuntime.ts` へ集約 |
| 2026-02-22 | `DialogPopMessages.tsx` は unmount / active controller 切替時に pending timer を cleanup する構成へ改善。Looking Glass event flow は `*Flow` 公開中心に名称整理し、AppController 側は flow 呼び出しに統一。`setStartupSettingsCapabilities()` は AppController の state/capability 系 API の近くへ移動し、読み順を改善 |
| 2026-02-22 | `useDialogPopTimers.ts` で dialog pop の timer 登録/一括cleanup を custom hook 化し、`DialogPopMessages.tsx` の timer bookkeeping を簡素化。`SincroAppLookingGlassEventFlow.ts` の `emitLookingGlassConfigStatus(...)` は flow context 型ベースに統一し、LG event flow API の形状を揃えた。AppController private methods は event handlers→init/bind→state helpers の読み順を意識して整理を継続 |
| 2026-02-22 | dialog pop のアニメーション timing（show delay / hide transition）を `dialogPopAnimationHelpers.ts` の定数に集約し、`DialogPopMessages.tsx` の cleanup 余裕時間にも再利用。`emitSincroAppConnectionState(...)` を `SincroAppEmitHelpers.ts` に追加して AppController の派生接続状態通知を helper 経由へ統一。Looking Glass event flow には `active` 時 config status の二重通知意図（UI表示の収束性確保）をコメント追記 |
| 2026-02-22 | `DialogPopMessages.tsx` の表示件数は `DIALOG_POP_TIMING.renderLimit` に集約。`emitSincroAppSettingsApplyEvents(...)` を追加し、AppController `applySettings(...)` 後の settings/UI/startup/LG config 通知を helper 経由に整理。`buildSettingsRelatedSnapshotPayload()` により AppController 内の settings関連 payload 組み立て重複を削減 |
| 2026-02-22 | `SincroAppSettingsRelatedSnapshotBuilder.ts` を追加し、settings関連 payload 組み立て（settings/uiState/uiHints/startupStatus）を helper 化。`DialogManager` は `updateCharacterStatus()` / `updateUserMediaAvailabilityStatus()` 内で settingsChange の中間重複通知を抑止して発火回数を削減。React 側の表示件数/タイミング定数は `react/app/uiTuning.ts` に集約を開始（chat/telop/rtc logs, dialog pop） |
| 2026-02-22 | `DialogEventHub` に getter ベースの current UI state 通知ヘルパ（dialog/VRM）を追加し、`DialogManager` の UI state emit を薄く整理。AppController `applySettings(...)` は `getSettingsSnapshot()` 結果を settings関連 payload builder に再利用して重複 snapshot 合成を削減。`UI_TUNING.controlPanel.diagnostics` を追加し、Diagnostics の spacing / message log 高さ / status grid 列数などの表示値を定数化して反映 |
| 2026-02-22 | `DialogManager` の VRM status/start button 状態更新は同値ガードを追加し、不要な `dialog_ui_state` / `dialog_vrm_ui_state` 通知を抑止。AppController は settings関連 payload の短命キャッシュで同期処理内の重複 snapshot 生成を抑制。`UI_TUNING.controlPanel` を拡張し、Control Panel 本体の section spacing / details margin も定数化して `SimpleVrmControlPanel` に適用 |
| 2026-02-22 | AppController `subscribe()` の初期イベント送出も settings関連 payload の短命キャッシュを利用し、初回購読時の重複 snapshot 合成を削減。`DialogManager` には dialog/VRM UI state の通知順序意図コメントを補強。`SettingsSections.tsx` にも `UI_TUNING.controlPanel` を展開し、basic/mic/character/startup/Looking Glass 設定セクションの spacing を定数化 |
| 2026-02-22 | `UI_TUNING.controlPanel.settings` を追加し、settings tooltip/help badge/各セクションの spacing を `SettingsSections.tsx` へ適用して見た目調整点を一元化。AppController `start()` は起動時 settings snapshot を lifecycle通知と startup適用値保存で再利用し、微小な重複計算を削減 |
| 2026-02-22 | `UI_TUNING.controlPanel.styles` を追加し、`panelStyles.ts` の root/button/miniCard/miniLog の調整値（radius/padding/font/maxHeight）を `UI_TUNING` に集約。`looking-glass-vrm` Control Panel の案内文も日本語表現を微調整し、エラー時の確認先（LG Code / LG Detail）と再読み込み推奨文言を明確化 |
| 2026-02-22 | `UI_TUNING.controlPanel.styles` を拡張し、Control Panel のボタン間隔・Diagnostics カード間隔・section title 余白も定数化。`PanelControls` / `DiagnosticsStatusCards` / `DiagnosticsLogSections` に適用し、操作ボタン（開始/停止）と Diagnostics の主要ラベル/空状態文言を日本語寄りに調整 |
| 2026-02-22 | `Control Panel` / `Diagnostics` の残り文言を日本語寄りに調整（`トークモード (talk mode)`、`診断情報`、`Signaling状態`、`LGコード` / `LG詳細` など）。`looking-glass-vrm` の LGエラー時案内も日本語表現を整理 |
| 2026-02-22 | `UI_TUNING.controlPanel.settings` / `UI_TUNING.controlPanel.styles` を追加拡張し、Control Panel 本体・Diagnostics・Settings の spacing/tooltip/help badge 調整値を集約。`looking-glass-vrm` の案内文は LGエラー時の確認先を `LGコード` / `LG詳細` 表記に統一 |
| 2026-02-22 | `VRM360/SphereVideo.ts` の HLS 再生経路を `hls.js` 遅延読み込みへ変更。`vite.config.js` の `manualChunks` では `vendor_three_renderers` / `vendor_hls` / `vendor_yaml` を追加分割し、`vendor_misc` を縮小。`vendor_hls` は遅延読み込み chunk として分離（サイズ警告は残る）。`VRM360 設定パネル` / `Looking Glass VRM1.0 設定パネル` へ見出しを日本語寄りに調整 |
| 2026-02-22 | Looking Glass 実機での焦点/ピンボケ調整向けに `Target Z` / `Target Diam` を `looking-glass-vrm` の設定UIに追加。`LookingGlassRuntimeConfig` と WebXR polyfill 初期化オプションへ反映し、`焦点調整用 (Focus)` プリセットを追加。案内文でも `Target Z` / `Target Diam` を優先調整項目として明記 |
| 2026-02-22 | `three/src/renderers` の chunk 分割は three 内部の初期化順エラー（`Cannot access 'Je' before initialization`）を誘発したため撤回。安定性優先で `three` は単一 chunk に戻し、`hls.js` 遅延読み込み + `vendor_hls` 分離を継続 |
| 2026-02-22 | Looking Glass 実機で初回 `Start Looking Glass` が polyfill 制約により失敗する場合に備え、`LookingGlassXRController` で初回 `immersive-vr` 前の `navigator.xr.isSessionSupported(\"immersive-vr\")` ウォームアップを追加 |
| 2026-02-22 | Looking Glass セッション終了時に polyfill を次回再初期化可能状態へ戻す処理を追加し、セッション中の LG 設定変更はページ再読み込み不要で「セッション終了後の再実行」で反映できるよう改善。Control Panel の案内文も同方針に合わせて更新 |
| 2026-02-22 | `looking-glass-vrm` の Control Panel に `Looking Glass 開始` / `Looking Glass 停止` ボタンを追加し、設定メニュー側から実行/停止できるよう更新。`LookingGlassXRController` は Debug Console ボタンに加えて custom event 経由の start/stop request を受け付け、`XRSession.end()` による停止を実装 |
| 2026-02-22 | `Start Looking Glass` を Debug Console から削除し、`looking-glass-vrm` では Control Panel を正式な実行導線に統一。`LookingGlassXRController` は Debug Console ボタン未配置時も error 扱いせず、custom event 経由の start/stop 操作を継続利用できるよう更新 |
| 2026-02-22 | 右上 Debug メニューの `Open Startup Dialog` を削除。起動前設定の React dialog UI は枠線/背景/ヘッダー/開始ボタンの見た目を調整し、Control Panel / Debug Console とトーンを揃える方向で更新 |
| 2026-02-22 | 起動前設定の既定値を見直し、通常ページでは `Character` / `Gaze` を初期ONに変更。`VRM360`（360deg camera）のみ `SincroVRM360Initializer` で `Gaze` を既定OFFに上書きし、Character は既定ONを維持 |
| 2026-04-19 | 選択したマイク入力 `audioInputDeviceId` を `getUserMedia` 制約へ反映し、実行中変更時も再取得 + `replaceTrack()` でRTC送信とLocal Mic meterを継続できるよう更新 |
| 2026-04-19 | 起動前設定 dialog にマイク入力 / 視線用カメラ selector とデバイス一覧再読込を追加。`useSincroMediaDeviceState` と接続し、ラベル未解決案内と無効な `deviceId` のヒント表示を実装 |
| 2026-04-19 | `videoInputDeviceId` を CharacterGaze 専用カメラ取得へ反映。`VideoInputManager` を追加し、起動時選択・実行中カメラ切替・Gaze OFF/ON 時も `characterGazeVideo` preview と AutoMute が選択カメラに追従するよう更新 |
| 2026-04-19 | 起動前設定の Start 可否を選択デバイス基準へ調整。無効な `audioInputDeviceId`、および Gaze 有効時の無効な `videoInputDeviceId` では Start を disabled にし、開始不可理由をボタン下 hint と selector hint の両方に表示するよう更新。設定パネルは正式な設定導線、Debug Console は診断/プレビュー導線として文言も整理 |
| 2026-04-19 | 設定パネルを `会話設定` / `音声設定` / `表示設定` / `起動オプション` / `開発者向け` に再編し、起動前 dialog も `会話設定` / `音声設定` / `表示設定` のカテゴリカードへ整理。`looking-glass-vrm` はページ限定の `Looking Glass 設定` を独立表示し、接続状態や診断カードは `開発者向け` へ集約 |
| 2026-04-19 | 右側ツールUIの表示ルールを追記。設定パネルと Debug Console は同じツール領域として扱い、重ならない表示、空カテゴリ非表示、概要優先の診断構成、共通の閉じる導線・見た目整合を設計方針として明文化 |
| 2026-04-19 | 右側ツールUIの見た目を寄せ、設定パネルは初期展開カテゴリを絞って縦長化を抑制。Debug Console は `Overview` 優先とし、Audio / Gaze の調整UIを `高度な調整` として折りたたみ導線へ整理 |
| 2026-04-19 | 設定UIを `上部ヘッダー + 左カテゴリナビ + 右詳細ペイン` へ再整理する方針を追記。主要カテゴリを `会話` / `入出力デバイス` / `音声` / `表示` / `接続` に再定義し、接続操作の分離、起動前 dialog と開始後パネルの文言・情報設計共通化を明文化 |
| 2026-04-19 | `SettingsShell` を追加し、起動前 dialog と `SimpleVrmControlPanel` 系を共通のカテゴリナビシェルへ移行。接続操作と開始時オプションを `接続` ページへ集約し、dialog 側にも同じカテゴリ構成を適用 |
| 2026-04-21 | `uiFoundation.css` を追加し、`tokens / foundation / components / utilities / legacy` の CSS レイヤ方針を明文化。起動前 dialog の暗色面責務を `configurationDialogSettings.css` へ寄せ、`sincroConfigurationDialog.css` は bridge / legacy fallback に限定した |
| 2026-04-19 | `TASK-3007` 対応として `SettingsShell` の本文前 summary 構造をやめ、固定高さのページヘッダー直後から本文を始める構成へ修正。一般カテゴリでは冗長な状態カードを廃止し、状態表示は対象セクションや CTA 近くへ寄せた |
| 2026-04-19 | 起動前 dialog を `初回セットアップウィザード` として再定義。`トップへ戻る` / `閉じる` / `キャンセル` の役割差、ESC・背景クリック禁止、開始ボタンの前進文言を設計へ反映 |
| 2026-04-19 | 初回セットアップ dialog のサイズ基準を `960-1120px x 620-780px`、右側設定パネルの幅基準を `420-560px` として追記。`SettingsShell` の左ナビ幅、`開発者向け` の分離見出し、カテゴリ内セクション面、狭幅時の縮退順序を明文化 |
| 2026-04-22 | `TASK-3015` 対応として Debug Console を React 正式描画へ移行。`debugConsole.html` は削除し、右側ツール領域の state owner を App/service 側へ寄せる前段として React shell を導入した。`DebugConsoleManager` は DOM manager から diagnostics snapshot provider へ縮退した |
| 2026-04-22 | `TASK-3017` 対応として右側ツール領域の state owner を `SincroAppRightToolPanelService` へ移し、React 側の開閉 API を `appController.debug.*` へ集約した。`src/ts/UI/rightToolPanelStore.ts` は削除し、`DebugConsoleManager` はツール領域 owner ではなく diagnostics core に専念する構成へ整理した |
| 2026-04-24 | `TASK-3017` 対応として `ChatMessageManager` を `ChatMessageService`、`PopManager` を `PopMessageService` へ改名した。`SincroAppController` / runtime bundle / subscription helper の依存名も service 前提へ揃え、`manager` 名を残す対象を `DialogManager` と `DebugConsoleManager` に絞った |
| 2026-04-22 | `TASK-3016` 対応として起動前 dialog の bridge DOM を撤去。VRM file picker と drag & drop は `ConfigurationDialogSettingsPanel` の React 正規経路へ移し、`DialogBridgeDomAdapter` は `HTMLDialogElement` の open/close と Esc / backdrop close 抑止だけを扱う最小 platform adapter に縮退した |
| 2026-04-24 | `TASK-3019` 調査結果を反映し、`simple-vrm` を中心とした main content の dark / immersive visual 方針、overlay 設計、`meta viewport` を前提とする responsive 基盤、legacy global reset の縮退方針を追記した |
| 2026-04-25 | `TASK-3026` 対応としてトップページを mode selection dashboard として定義し、`Simple Interface` 主導線、`360deg Camera` / `Looking Glass` 副導線、GitHub 補助リンク、状態ラベル、desktop/mobile 初期表示基準を追記した |
| 2026-04-25 | `TASK-3026` 追加調整として mode card に差し替え可能な SVG コンセプト画像を置く方針を追記した |
| 2026-04-30 | `64436a7` 周辺の UI 不整合調査を反映。起動前 dialog / 右側設定パネル / Debug Console の overlay chrome が分散していることを整理し、`TASK-3027` 以降で close button、right tool frame、startup dialog frame、フォーム primitive、visual regression 確認へ段階分割して共通化する方針を追記 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/networking_rtc.md`
  - `documents/design/frontend_character.md`
- 参照実装:
  - `sincromisor-frontend/src/ts/SincroController.ts`
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-frontend/vite.config.js`
- 外部リンク:
  - https://vitejs.dev/
