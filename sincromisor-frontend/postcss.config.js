import cascadeLayers from "@csstools/postcss-cascade-layers";
import nesting from "postcss-nesting";

// OBSがheadへ追加する通常CSSに、レイヤー内のアプリ指定が一律に負けるのを防ぐ。
// ネストを展開してからレイヤー順を詳細度へ変換し、開発・本番で同じ優先順位を使う。
export default {
    plugins: [nesting(), cascadeLayers()],
};
