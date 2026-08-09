## 確認

`npm run gate` は未変更の
`tasks/bug/task-260810024443-pion-recognizer-input-accumulation/task.md` のPrettier不整形で停止した。
基点でも同じ `npx prettier --check` の失敗を再現し、本タスクの差分原因ではないことを確認した。
