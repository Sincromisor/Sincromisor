# 実装上の判断と確認環境

- Editorの明示的な `instructions: true` は採用版ではコード側初期指示と競合する。コード初期値を持ち公開済み設定だけで上書きする既定動作を採用した。
- Studioのブラウザー向けAPI URLは待受アドレスと異なるため、`MASTRA_AUTO_DETECT_URL=true` を使う。
- 標準HTTPの取消が実Gemmaへ伝播したため独自のストリーム経路は不要だった。
- 通常サンドボックスではMemoryテストのNode 24が `InternalCallbackScope::Close` assertionで終了する。同じテストは権限制約を外すと親で4回、独立評価で1回成功した。環境条件による差として切り分けた。テストの後始末は標準 `mastra.shutdown()` に統一した。
- 全体ゲートの既存Markdown不整合と、libSQLのフィードバック一覧未対応は `task.md` に記録した。対象サービスの必須確認は実環境でも実行済み。
