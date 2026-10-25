import cascadeLayers from "@csstools/postcss-cascade-layers";
import isPseudoClass from "@csstools/postcss-is-pseudo-class";
import systemUiFontFamily from "@csstools/postcss-system-ui-font-family";
import textDecorationShorthand from "@csstools/postcss-text-decoration-shorthand";
import autoprefixer from "autoprefixer";
import clamp from "postcss-clamp";
import colorFunctionalNotation from "postcss-color-functional-notation";
import colorHexAlpha from "postcss-color-hex-alpha";
import customProperties from "postcss-custom-properties";
import fontVariant from "postcss-font-variant";
import gapProperties from "postcss-gap-properties";
import logical from "postcss-logical";
import nesting from "postcss-nesting";
import place from "postcss-place";
import replaceOverflowWrap from "postcss-replace-overflow-wrap";

// 現在のCSSに必要な互換変換だけを使う。新構文を追加するときは対象ブラウザーも確認する。
export default {
    plugins: [
        nesting(),
        logical(),
        colorFunctionalNotation(),
        colorHexAlpha(),
        fontVariant(),
        // ネストが作る:is()を展開し、IDとクラスが混在する選択子の詳細度を維持する。
        isPseudoClass(),
        gapProperties(),
        replaceOverflowWrap(),
        place(),
        systemUiFontFamily(),
        textDecorationShorthand(),
        clamp(),
        customProperties(),
        // レイヤーを詳細度へ変換する処理は、選択子・宣言の変換後に実行する。
        cascadeLayers(),
        autoprefixer({
            overrideBrowserslist: "defaults or chrome >= 103",
        }),
    ],
};
