# Opus入力の基準波形

`opus_to_s16le.json`は、10 msのOpusパケット2個と、その入力から得る20 ms・16 kHz・mono・s16leの320標本を固定する。
`packets`は生のOpusパケットをBase64で表し、`pcm`は符号付き16 bit整数の配列である。
実行時には再エンコードせず、この入力を本番の入力処理へ渡す。

## 作成と更新

2026-10-12にLinux/amd64、Go 1.26.9、`github.com/pion/mediadevices v0.10.0`の同梱libopusと`github.com/pion/opus v0.1.0`で取得した。
入力はテストの`goldenMonoPCM(960)`と`goldenStereoPCM(960)`、符号化は`encodeTestOpus`の`Latency10ms`、出力は`runInputFrames`で取得した最初のフレームである。
monoは1 kHz・振幅12,000、stereoは左が同じ信号、右が2 kHz・振幅6,000の48 kHz合成波形であり、録音音声は含まない。

保存したPCMをs16leへ直列化したSHA-256は、従来のテストの基準値と一致する。

| 入力   | PCMのSHA-256                                                       |
| ------ | ------------------------------------------------------------------ |
| mono   | `0ecfdf1f7cb3a778131433fcddf8fbadb9d19f457090e384e50bd6040818b603` |
| stereo | `1f5ad64df08fe58a57cdb3091f4cc11fde5b33f3ecec531f9a71dc60120645c2` |

更新時は上記の入力・関数・依存バージョンでパケットとPCMを採取し、期待する音声変換の変更であることを確認してからJSONを更新する。
テストの実行で期待値を上書きしない。

## 比較の許容幅

macOS/arm64では、Linux/amd64と同じOpusパケットに対してmonoの13標本に最大2、stereoの18標本に最大1の差があった。
Goデコーダーだけに`-gcflags='github.com/pion/opus/...=-d=fmahash=n'`を指定すると従来のハッシュへ一致し、融合積和の丸め差と切り分けられた。
このフラグは調査用であり、通常のビルド・試験には指定しない。FFmpegはこの変換に関与しない。

そのため全320標本を比較し、各標本に最大2 LSBだけを許容する。フレーム数・バイト数・2パケット消費後の提出は厳密に確認する。
FIR係数、再標本化の周波数応答、ステレオ平均の別試験も維持し、単なる非無音判定へ置き換えない。
EOF・中断・SSRC変更の試験では実行時エンコーダーを引き続き使う。
