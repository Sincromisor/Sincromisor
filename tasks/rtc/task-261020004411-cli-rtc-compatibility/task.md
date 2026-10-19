# SincromisorCLIの現行RTCサーバー互換性を確認・修正する

## 背景・目的

SincromisorCLIが現行のGo/Pion RTCサーバーで動くか確認し、不整合を修正する。
確認対象はSincromisorの`2ccd5303`と、隣接するSincromisorCLIの`37acc5e`を基点とする。
通信の基準は[フロントエンドのRTC契約](../../../documents/design/contracts/frontend-rtc.md)と現在のGo実装である。

## 完了条件

- [x] シグナリング、DataChannel属性、音声トラックの契約を照合する。
- [x] 接続を妨げる不具合を修正し、回帰テストで確認する。
- [x] 現行RTCサーバーの実プロセスと音声を送受信し、テキスト・テロップを受信する。
- [x] 利用手順、確認結果、未実行事項を記録し、既存の未コミット変更を保持する。

## 変更範囲・設計判断

実装対象は別リポジトリ`/home/gloria/projects/SincromisorCLI`の接続クラス、設定、起動スクリプト、README、回帰テストである。
Sincromisor側には本タスクと索引を記録する。サーバーとブラウザーの通信契約は変更しない。
別リポジトリのため、CLI実装とSincromisorの記録はそれぞれ1コミットとする。
CLI修正コミットは`545594d`である。リモート更新の取り込み前は`87696b1`だった。

- `telop_ch`を`ordered=False, maxRetransmits=0`へ修正する。
- 初回Offerへ要求UUIDと改訂番号を付け、Answerの種別・改訂番号・セッションIDの有無を検証する。
- ICE候補送信へ改訂番号を付け、HTTP失敗を握り潰さない。
- STUN/TURNなしの到達可能なネットワークを許可するため、空のICEサーバー配列を受理する。
- HTTP待機をイベントループから分離し、Offerは10秒、候補は5秒の通信期限を設ける。
- HTTP失敗・ICE失敗・停止通知で接続を閉じ、起動スクリプトも例外時に録音・再生を終了する。
- 設定全体やSDPのログ出力を除き、接続結果はセッションIDで記録する。

aiortc 1.14.0は`setLocalDescription`でICE候補を収集し、SDPに含める。通常の実接続はこの経路を確認した。
個別候補の送信は直接呼出しで現行サーバーによる受理を確認した。自動再接続や旧RTCサーバーへの対応は追加しない。

既存の`AudioRecorderProcess.py`、`AudioSenderTrack.py`、未追跡の`examples/sd_input_test.py`は変更・コミットしない。
Sincromisor側の未追跡`volumes/proper-noun-dictionaries/`も保持する。

## 確認結果

### 修正前の再現

音声デバイスを使わないテスト5件で、2件失敗・3件エラーを確認した。

- 実接続はICE接続後に`invalid telop data channel attributes`となり、サーバーが`invalid_data_channel`で終了した。
- 空の`iceServers`はPydanticの設定検証で拒否された。
- ICE候補に必須の`offer_revision`がなかった。
- OfferのHTTP 400は文字列をraiseするため、原因を示す例外でなく`TypeError`になった。

### 修正後の確認

Python 3.12、aiortc 1.14.0、PyAV 16.1.0を利用した。依存パッケージは追加・更新していない。
検証用コピーで確認後、対象ファイルの内容一致を検査してCLIリポジトリへ反映した。

- 単体8件、実サーバー接続2件、計10件成功。
- `echo`で440 Hzの合成音声を送信し、無音でない返却音声と両DataChannelの開通を確認した。
- `playback`で既定素材の音声、`text_ch`のJSON、`telop_ch`のJSONを受信した。
- 改訂番号付き`candidate: null`を実サーバーが受理した。
- HTTPエラー、不正Answer、ICE失敗時の接続終了を確認した。
- 変更PythonファイルのRuff静的検査（E4/E7/E9/F）と整形確認、READMEのPrettier確認、`git diff --check`が成功した。
- 変更箇所と直接関連する処理のコメント点検はPASS。

RTCサーバーは既存サービスを変更せず、専用プロセスで起動した。再現用コマンドは次のとおり。
`interface`と`public-ipv4`は実行環境の到達可能なIPv4に合わせる。

```sh
# Sincromisor/sincromisor-server/sincro-rtcで実行
 go build -o /tmp/sincro-rtc-cli-check ./cmd/sincro-rtc
 /tmp/sincro-rtc-cli-check --http=127.0.0.1:18088 --frontend-dir=/tmp \
   --interface=eth1 --public-ipv4=192.168.1.75 --media-udp-port=18089

# SincromisorCLIで実行
SINCRO_RTC_TEST_URL=http://127.0.0.1:18088/api/v1/RTCSignalingServer \
  .venv/bin/python -m unittest discover -s tests -v
```

## リモート更新の取り込みと再確認

前回の作業ではリモート履歴の取得を行わず、CLIの雑音修正`891cd2e`を取り込めていなかった。
両リポジトリで`git fetch origin`を実行し、CLIだけがローカル1件・リモート1件に分岐していることを確認した。
リモート修正は`AudioPlayer.py`と`SoundDeviceList.py`で、今回のRTC互換修正とは変更ファイルが重ならなかった。

`git rebase --autostash origin/main`で未コミット変更を退避・復元し、雑音修正の上へRTC互換修正を載せ直した。
`git range-diff`でRTC修正の差分が完全に同じこと、録音・送信処理と未追跡の例の3ファイルが
取り込み前のSHA-256と一致することを確認した。競合は発生していない。

取り込み後のCLI作業ディレクトリで実サーバー接続を含む10件のテストが再度成功した。
追加で、取り込んだ`AudioPlayer`の無音初期化、初回フレーム時だけの出力開始、終了処理を
音声デバイスの代替オブジェクトで確認した。検証専用のRTCプロセスは終了済みである。

CLIは`origin/main`に対して未取り込み0件・未送信1件となった。
Sincromisor本体は未取り込み0件・未送信22件で、既存のローカル履歴を維持した。
リモートへのpushは行っていない。

## 未実行事項・制約

実マイク・スピーカーと、音声認識・LLM・音声合成サービスを通す`chat` / `sincro`の会話全体は未確認。
RTCの接続とメディア・DataChannelの互換性までを実証した。NAT越え、TURN、長時間接続は検証していない。
通常の切断時はCLIが終了し、再接続には再起動が必要である。
