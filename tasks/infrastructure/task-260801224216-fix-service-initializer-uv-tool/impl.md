# Implementation Log: task-260801224216-fix-service-initializer-uv-tool

## Completion Summary

- `uv init` / `uv add` / `rm main.py` を `uv tool install huggingface-hub` に置き換え、
  uv の project template 生成物への依存を解消した。
- 起動スクリプトは project 環境を探索する `uv run` を介さず、tool として導入された
  `/opt/sincromisor/.local/bin/hf` を直接実行するようにした。
- `service-initializer` の no-cache build、非 root ユーザーでの CLI 起動、
  full profile の全 9 イメージ build が成功した。

## Verification

- `docker compose build --no-cache service-initializer`: 成功
- `docker run --rm --user sincromisor --entrypoint /opt/sincromisor/.local/bin/hf ghcr.io/sincromisor/service-initializer:latest --help`: 成功
- `docker compose --profile full build`: 成功（全 9 イメージ）
- `sh -n Docker/service-initializer/initialize.sh`: 成功
- `git diff --check`: 成功
- `npm run tasks:index`: 成功
- `npm run tasks:index:check`: 成功
- `npm run tasks:check`: 成功

## Not Run

- `npm --prefix sincromisor-frontend run check:md`: ホスト側に `prettier` が導入されておらず、
  `prettier: not found` で実行不可。変更した Markdown は目視と `git diff --check` で確認した。
