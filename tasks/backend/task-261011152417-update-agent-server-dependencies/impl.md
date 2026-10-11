# 未確認範囲と再開条件

実装は`/Users/aki/.codex/worktrees/agent-dependency-update/Sincromisor`のコミット`ea988231`に保持する。現在のmainには統合していない。

このホストにDockerと稼働中の既存ローカルLLMがないため、実LLMとの会話は未確認。既存試験の固定応答サーバーと本番Mastra、Pythonの実HTTP変換は確認できたが、生成モデルとの結合を置き換えるものではない。実LLMが使える環境で会話1件を確認し、Dockerの本番イメージで再現確認した後に再評価する。

Studioには通常の会話Editorとは別に、指示を編集する`/cms/agents/sincromisor-character/edit`がある。使い捨てDBで指示を変更しSave・Publishを行い、再読込み後の反映を確認した。Dockerと同じ`MASTRA_AUTO_DETECT_URL=true`が同一オリジンの認証に必要。共有認証・会話ボリュームへは触れていない。
