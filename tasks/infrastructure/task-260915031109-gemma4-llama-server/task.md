# Gemma 4 E2Bのllama-serverをComposeへ同梱する

## 背景 / 目的

DifyとLLMの外部配備に依存する構成を、管理下のComposeへ移す。ユーザー指定のGemma 4 E2BをOpenAI互換APIで提供する。
起票時の確認基点は `de2c1e76f6f3965fd0364c4a847ead1208644ca1`。現在の [Compose設計](../../../documents/design/infrastructure/compose.md) はDify・LLMを同梱していない。

## 完了条件

- [x] 指示調整済みGemma 4 E2Bを固定したllama.cppイメージとGGUFで起動できる。
- [x] 同じComposeネットワークから日本語のストリーミング応答と、無害なツール呼び出し・結果投入後の回答を取得できる。
- [x] モデルの取得元・リビジョン・ファイル・量子化・実行設定を記録し、取得済みモデルでコンテナ再作成後も起動できる。
- [x] モデル未配置は原因が分かる失敗となり、ロード完了後だけ死活確認が成功する。
- [x] 設定サンプル、取得・起動手順、Compose・保存領域の設計を同期する。

## 設計判断

- テキスト生成だけを使う。画像・音声入力や投機的デコード用の追加モデルは導入しない。
- 取得元候補は `ggml-org/gemma-4-E2B-it-GGUF`。量子化、コンテキスト長、GPU割当は検証ホストで動く最小構成を実装者が選び固定する。モデル系列は無断で変更しない。
- モデルは管理者が事前取得し、Git管理外の専用保存先を読み取り専用でマウントする。通常起動・会話時の外部APIやモデル取得を必須にしない。
- 新サービス `llama-server` は `sincromisor-net` 内の `0.0.0.0:8080` で待ち受け、ホストへ公開しない。利用URLは `http://llama-server:8080/v1`。
- 追加プロファイル `chat` で起動する。既存の `full` / `backend` / `rtc` 単独の起動範囲は増やさない。
- イメージ、モデルパス、推論設定はルート `.env` から追加予定の `compose/llama-server.yml` のコマンド・マウントへ渡す。サンプルは `examples/compose.env` に置く。
- 死活確認は採用イメージ内で利用できるコマンドから `/health` を確認する。存在しないコマンドを仮定せず、ロード中と正常時を区別する。

## 変更範囲と文書

- `compose.yml`、追加予定の `compose/llama-server.yml`、`examples/compose.env`。イメージの加工が必要な場合だけ `Docker/llama-server/` を追加する。
- [保存領域設計](../../../documents/design/infrastructure/storage.md)、[Compose設計](../../../documents/design/infrastructure/compose.md)、[README](../../../README.md) のモデル準備手順。
- Mastra、MCP、Dify切替、モデル比較、負荷試験は対象外。

## 確認方法

- 実際の `.env` を上書きせず、例示設定でComposeの構文、プロファイル、マウント、公開ポートを確認する。
- 実イメージでロード完了、通常ストリーミング、ツール呼び出しと結果投入を各1経路確認する。
- モデル未配置時の失敗と、同じモデルでのコンテナ再作成を確認する。GPU・モデル条件と実行コマンドを記録する。
- 実機やモデルを利用できない場合は互換性を成功扱いせず、必要な環境と解除条件を記録する。

## 依存と外部参照

後続は [task-260915031110-mastra-studio-session-memory](../../backend/task-260915031110-mastra-studio-session-memory/task.md)。外部資料の確認日: 2026-09-15。Gemma 4 E2Bのテキスト推論とツール呼び出しに必要な範囲を採用する。

- [Gemma 4モデルカード](https://ai.google.dev/gemma/docs/core/model_card_4)
- [指示調整済みGGUF](https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/tree/main)
- [llama-server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)
- [ツール呼び出し](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md)

## 実装・確認結果

2026-09-15に現在のワークツリーで実装・確認した。

- 公式CPUイメージのダイジェストは `sha256:e271606125389acbd8aec0481e7ea0627f12d7edd4412c19dbc0d427227a737e`。
  実イメージは `0.4.1-dev / build 10964 / b29c606e28a01b1bc8c1351026a0fa6e616bf6c4`。`/usr/bin/curl` の存在も確認した。
- GGUFは `b4243c156154b6dca9324415f8c7ccc098b4aed1` のQ4_0。
  SHA-256は `8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52`。
- 検証ホストはRyzen 5 3600、RAM 31GiB、RTX 5060 Ti 16GB。GPUの空きが679MiBだったためCPUで6スレッド・4096トークン・1スロットを採用した。
- `node --test scripts/tests/llama-compose.test.mjs`: PASS。full/backend/rtcへの混入なし、内部ネットワーク、ポート非公開、固定イメージ、読み取り専用マウントを確認した。
- 下記の実HTTP確認: PASS。日本語本文「こんにちは。」、`get_secret_word({})` 呼出し、ツール結果を投入した後の回答「確認用の合言葉は『青空みかん742』です。」を取得した。本文の推論混入なし、正常理由stopとDONEを確認した。
- `SINCRO_LLAMA_MODEL_FILE=missing.gguf docker compose --env-file examples/compose.env --profile chat run --rm --no-deps llama-server`: 非ゼロ終了、モデルファイル不存在の読込みエラーを確認した。
- `docker compose --env-file examples/compose.env --profile chat up -d --no-deps --pull never --force-recreate llama-server`: 同じモデルで再起動した。直後の `/health` は503、ロード後は200となった。
- 変更MarkdownのPrettier確認とコメント点検: PASS。既存サービスとルート `.env` は変更していない。モデル本体はGit管理外。CPU構成で機能を確認しており、GPU性能比較は実施していない。

実HTTP確認は、同じComposeネットワークで起動済みのPythonコンテナから再実行できる。

```sh
docker exec -i sincromisor-text-processor-1 /opt/sincromisor/.venv/bin/python - \
  < tasks/infrastructure/task-260915031109-gemma4-llama-server/acceptance/llama_smoke.py
```
