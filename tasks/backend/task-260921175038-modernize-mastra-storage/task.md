# 非推奨APIの調査とMastra保存領域型の更新

## 背景 / 目的

MastraStorage の警告を契機に採用済み型定義と全 TypeScript ソースを照合する。

## 完了条件

- [x] createCharacterAgent の保存領域型を MastraCompositeStore に変更する。application は既に同型を生成している。
- [x] AgentServer の型検査と既存テスト。TypeScript language service の reportsDeprecated を両 tsconfig の全対象から採取する。

## 変更範囲と確認方法

createCharacterAgent の保存領域型を MastraCompositeStore に変更する。application は既に同型を生成している。

AgentServer の型検査と既存テスト。TypeScript language service の reportsDeprecated を両 tsconfig の全対象から採取する。

## 文書同期

依存版、外部契約と保存形式は維持するため設計変更は不要。調査・確認結果は本タスクに記録する。

## 調査結果

2026-09-21、インストール済み依存の型定義をTypeScript 5.9.3のlanguage serviceで照合した。AgentServerの10ファイルで2参照、frontendの624ファイルで96参照を検出した。importと使用箇所は別々に数える。依存内部の実装や全言語の非推奨APIを網羅する検査ではない。

再実行はリポジトリルートで次を使う。

```sh
node tasks/backend/task-260921175038-modernize-mastra-storage/artifacts/check-deprecations.cjs sincromisor-server/agent-server/tsconfig.json sincromisor-frontend/tsconfig.modern.json
```

| 対象                     | 結果と対応                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| MastraStorage            | MastraCompositeStoreへ型を統一。本タスクで対応                                                                                          |
| Zod finite               | number自体が有限値のみを受理。数値検証タスクで整理                                                                                      |
| Zod passthrough / strict | looseObject / strictObjectへ移行。strictは型上の非推奨タグがなく、公式移行ガイドから追加検出                                            |
| Three.js Clock           | Timerへ移行。描画・UIタスクで対応                                                                                                       |
| React MutableRefObject   | RefObjectへ移行。描画・UIタスクで対応                                                                                                   |
| MediaPipe handednesses   | handednessから読み、保存形式は維持。描画・UIタスクで対応                                                                                |
| 独自solveWorldArmIk      | 現在もtemporal入力欠損・無効時の代替経路から呼ばれる。ライブラリAPIの置換と異なり、削除すると動作契約を変えるため今回は維持             |
| Python / Go              | 本番ソースの非推奨表記と旧Pydantic・ioutilの代表的使用を検索。VOICEVOXのspeakerコメントを検出したが、型診断による網羅確認は行っていない |

独自IKの維持根拠は `sincroPoseRetargeter.ts` の `retargetPoseArm` 呼出しと [現在の動作契約](../../../documents/design/frontend/character/motion.md)。削除にはtemporal欠損時の代替方針と旧ログ再生の確認が必要であり、非推奨タグだけを消して解決扱いにはしない。

一次資料（2026-09-21確認）:

- [Mastraの保存領域構成](https://mastra.ai/blog/composite-storage-with-mastra-storage)
- [Zod移行ガイド](https://zod.dev/v4/changelog)
- [Three.js Timer](https://threejs.org/docs/pages/Timer.html)

## 確認結果

AgentServerの型検査と既存5テストに合格。保存領域型以外の動作・依存・DB・通信契約に変更はない。コメント点検: PASS。

## 最終追補

型診断の対象外だったVite設定にもrollupOptionsとmanualChunksが残っていたため、[Vite設定更新](../../frontend/task-260921175828-modernize-vite-config/task.md)を追加実行した。依存ライブラリの非推奨参照は両tsconfigの再走査で0となり、独自solveWorldArmIkの2参照だけが残る。調査は静的型診断・ソース検索・採用依存の移行資料の照合によるもので、全依存の内部実装やPython/Goの全APIを網羅するものではない。
