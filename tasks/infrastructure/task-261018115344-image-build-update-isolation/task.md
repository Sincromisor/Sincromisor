# VOICEVOXの再展開を抑えPythonのuv導入を固定する

## 背景 / 目的

2026-10-18、HEAD `d9e4916b` を調査した。[VOICEVOX](../../../Docker/voicevox/Dockerfile) はConsulのコピー後にAPT導入と配布物の展開を行うため、Consul更新でそれらも無効化される。
既存イメージの展開レイヤーは約2.22GBだった。一方、Pythonの4サービスは版未固定のuvインストーラーを使い、再実行時にビルドツールの版が変わり得る。
調査の「更新頻度の異なる処理を分離する」に対応し、無関係な再実行とビルドツールの意図しない更新を抑える。

## 完了条件

- [x] VOICEVOXではConsulの変更がAPT導入・VOICEVOX配布物の展開のキャッシュに影響しない順序になる。
- [x] 配布物の版、部分取得を正常キャッシュにしない処理、所有権、Consul登録と起動方法を維持する。
- [x] Pythonの4サービスは、互換性を確認した同一の固定版uvバイナリを公式配布イメージから導入し、版未固定インストーラーへの依存をなくす。
- [x] ロック検証、Python版、仮想環境、uvの配置と実行PATH、NeMoのビルド段階から実行段階への引継ぎが成立する。

## 変更範囲・実装方針

対象は `Docker/voicevox/Dockerfile` と `Docker/{speech-extractor,speech-recognizer-nemo,text-processor,voice-synthesizer}/Dockerfile`。
VOICEVOXのConsulコピーを配布物展開より後へ移す。Pythonは既存の実行経路に合わせてuvを配置し、利用可能な固定タグまたはダイジェストを実装時に選ぶ。
curlやgitは実行・依存導入で使う箇所を確認し、インストーラー廃止だけを根拠に削除しない。
依存ロックの更新、Consul登録方式の変更、基底OS・CUDAの変更、全外部イメージの一括固定は含めない。

## 確認方法

- VOICEVOXの命令依存と生成物を確認し、Consulだけを変えた検証用入力で既存のAPT・展開段階が再利用されることを確認する。起動コマンドとConsulバイナリの利用可能性を確認する。
- Pythonの変更した4イメージを各1回ビルドし、固定したuv版、Python版、サービス別依存の読み込みと `uv run --no-sync` を確認する。既存のspeech-extractor初期化検査を維持する。
- 新たな巨大ビルドやGPU推論の網羅試験は追加せず、未実施の確認は具体的に記録する。

## 文書同期・実行上の制約

通信契約は変更しない。uvの導入方法を説明する既存文書があれば同期し、採用版と理由を本タスクへ記録する。
容量確認と作成物の扱いは [Docker Compose管理ルール](../../../documents/rules/docker-compose.md) に従う。APT保持設定の変更は別タスクの範囲とする。

## 実装・確認結果

VOICEVOXのConsulコピーを配布物展開後へ移した。配布物0.25.2、部分取得のtmpとrename、所有権、登録・起動方法は維持した。Consulコピー入力だけを検証用に変更した再ビルドでAPTと展開がCACHEDとなり、変更したConsulも実行できた。

Python4サービスは公式イメージghcr.io/astral-sh/uv:0.13.1からuv・uvxを既存の.local/binへコピーする。同版は先行タスクのインストーラーでも使用され、ロックとPython 3.14に適合していたため採用した。[公式Docker手順](https://docs.astral.sh/uv/guides/integration/docker/)を2026-10-18に確認した。curlはHTTP死活確認、gitはロックのGit依存用に維持した。NeMoは.local内のuv・Pythonと.venvを引き継ぎ、不要となったインストーラーの.config記録のコピーを削除した。

4イメージのビルド、uv 0.13.1、Python 3.14.8、uv sync --locked、uv run --no-syncで各サービス依存を確認した。NeMoのnemo.collections.asr読み込みとMediaPipe分類器初期化も成功した。最初の版表示検査はプラットフォーム名の付加で失敗したため、実際の出力を確認し版番号だけを比較する検査へ修正した。GPU推論・全サービス起動は未実施。Compose設計を同期し、コメント点検: PASS。

defaultビルダー、unix:///var/run/docker.sock、linux/amd64、--output type=cacheonlyを使用した。新規イメージタグ・ID・永続コンテナはない。キャッシュは115.6GBから135.2GBへ約19.6GB増加、空き123GB。既存GC（空き94.06GiB確保、未使用60日等）の下で通常ビルドに再利用し、GC設定と既存資産は変更していない。
