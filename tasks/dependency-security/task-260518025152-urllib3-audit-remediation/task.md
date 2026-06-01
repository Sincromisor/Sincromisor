# TASK-260518025152 urllib3 audit remediation

## 目的

`uv audit` で検出された `urllib3` の既知脆弱性を解消する。

## 対応範囲

- `urllib3` の解決下限を修正版へ引き上げる
- `uv.lock` を更新する
- `transformers` の audit 指摘は、5.0.0rc3 への移行影響が大きいため今回の対応対象外とする

## 確認

- [x] `uv lock --upgrade-package urllib3`
- [x] `uv audit`

## 結果

`urllib3` は `2.7.0` に更新済み。`uv audit` の残件は `transformers 4.53.3` のみ。
