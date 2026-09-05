# 合成音声復号固定データ

このディレクトリの固定データは、個人情報を含まない FFmpeg の合成正弦波の音源から生成した。
対応する MIME ごとにコンテナ復号、48 kHz モノラル化、サンプル数、非無音を検証する。

モジュールのルートでの生成コマンド:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=0.1' -ac 2 -c:a pcm_s16le -y internal/media/synthdecode/testdata/tone.wav
ffmpeg -hide_banner -loglevel error -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=0.1' -ac 2 -c:a aac -b:a 96k -f adts -y internal/media/synthdecode/testdata/tone.aac
ffmpeg -hide_banner -loglevel error -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=0.1' -ac 2 -c:a libvorbis -y internal/media/synthdecode/testdata/tone.ogg
ffmpeg -hide_banner -loglevel error -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=0.1' -ac 2 -c:a libopus -y internal/media/synthdecode/testdata/tone-opus.ogg
```

SHA-256:

```text
a638233d7810abd155a18a1bb75ae7a7e8f30a04627f742f2f6f6653b73f0c2c  tone-opus.ogg
7af6d11cbb2cb49d6b9794e7df9e438345bed102ac399f3a68fa8158e2a31495  tone.aac
c91da395de64d60b1336da9954b65088b4ec9c9fcd69211f3bf68e37b390ed0b  tone.ogg
7086bc9426e9814b431061c9d9652752141f7ecb37a128f90f79adee892bd975  tone.wav
```
