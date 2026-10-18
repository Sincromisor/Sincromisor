# VOICEVOXの再展開を抑えPythonのuv導入を固定する

## 背景 / 目的

2026-10-18、HEAD `d9e4916b` を調査した。[VOICEVOX](../../../Docker/voicevox/Dockerfile) はConsulのコピー後にAPT導入と配布物の展開を行うため、Consul更新でそれらも無効化される。
既存イメージの展開レイヤーは約2.22GBだった。一方、Pythonの4サービスは版未固定のuvインストーラーを使い、再実行時にビルドツールの版が変わり得る。
調査の「更新頻度の異なる処理を分離する」に対応し、無関係な再実行とビルドツールの意図しない更新を抑える。

## 完了条件

- [ ] VOICEVOXではConsulの変更がAPT導入・VOICEVOX配布物の展開のキャッシュに影響しない順序になる。
- [ ] 配布物の版、部分取得を正常キャッシュにしない処理、所有権、Consul登録と起動方法を維持する。
- [ ] Pythonの4サービスは、互換性を確認した同一の固定版uvバイナリを公式配布イメージから導入し、版未固定インストーラーへの依存をなくす。
- [ ] ロック検証、Python版、仮想環境、uvの配置と実行PATH、NeMoのビルド段階から実行段階への引継ぎが成立する。

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
