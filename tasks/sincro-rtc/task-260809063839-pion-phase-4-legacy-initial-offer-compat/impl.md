## 実装判断

- 完全にidentityを省略したinitial Offerだけをpresence-awareに判定し、既存UUID generatorとOfferRegistryへUUID/revision 1を渡す。部分欠損・明示的な空値/0は従来どおり400とする。legacy requestにはclient request IDがないためretryの同一Answer保証は追加しない。
