# TASK-260518024804 npm audit remediation

## 背景

`sincromisor-frontend` の `npm audit` で検出された既知脆弱性を確認し、安全な推移依存へ更新する。

## 作業内容

- `npm audit` の指摘内容を確認する。
- 修正可能な依存を `npm audit fix` で更新する。
- 更新後に `npm audit` とフロントエンドビルドを実行する。

## 調査結果

- `onnxruntime-web` 経由の `protobufjs@7.5.5` と `@protobufjs/utf8@1.1.0` が audit 対象だった。
- `package-lock.json` のみを更新し、直下依存の `package.json` は変更しなかった。

## 完了条件

- `npm audit` の指摘が解消している。
- `npm run build` が成功している。
- 関連差分がコミットされている。

## 確認結果

- `npm audit`: 既知脆弱性なし。
- `npm run build`: 成功。
