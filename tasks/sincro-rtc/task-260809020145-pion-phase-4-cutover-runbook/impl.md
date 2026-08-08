# 実装メモ

- `rtc` profile単独は`service-initializer`を選択せずcompose validationに失敗するため、runbookのaiortc操作は既存依存を含む`full` profileへ固定した。
