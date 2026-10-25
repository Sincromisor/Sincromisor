import postcss from "postcss";
import { describe, expect, it } from "vitest";
import config from "../../../postcss.config.js";

describe("既存ブラウザー向けのCSS変換", () => {
    it("ネストが作る:is()を展開し、IDとクラスの詳細度を揃える", async () => {
        const result = await postcss(config.plugins).process(
            "#notice, .notice { & .message { color: red; } }",
            { from: undefined },
        );
        expect(result.css).not.toMatch(/:is\(|&/);
        expect(result.css).toContain("#notice .message");
        expect(result.css).toContain(".notice:not(#does-not-exist) .message");
    });

    it("レイヤーを平坦化して、後のレイヤーを強い選択子へ変換する", async () => {
        const result = await postcss(config.plugins).process(
            `@layer legacy, components;
            @layer legacy { #notice { color: red; } }
            @layer components { .notice { color: blue; } }`,
            { from: undefined },
        );
        expect(result.css).not.toContain("@layer");
        // 元のID選択子よりも後段のクラス選択子を強くし、レイヤー順を保持する。
        expect(result.css).toContain(".notice:not(#\\#):not(#\\#)");
        expect(result.css).toContain("color: blue");
    });

    it("色・変数・論理方向・省略記法に必要な代替宣言を残す", async () => {
        const result = await postcss(config.plugins).process(
            `:root { --space: 12px; }
            .panel {
                display: grid;
                color: #11223380;
                background: hsl(220deg 20% 12%);
                padding: var(--space);
                padding-inline: 16px;
                gap: 8px;
                place-items: center;
                overflow-wrap: break-word;
                user-select: none;
                font-variant-numeric: tabular-nums;
                font-size: clamp(12px, 2vw, 20px);
            }`,
            { from: undefined },
        );
        const declarations = [];
        result.root.walkDecls((declaration) => {
            declarations.push(`${declaration.prop}: ${declaration.value}`);
        });
        expect(declarations).toEqual(
            expect.arrayContaining([
                "color: rgba(17,34,51,0.50196)",
                "background: hsl(220, 20%, 12%)",
                "padding: 12px",
                "padding: var(--space)",
                "padding-left: 16px",
                "padding-right: 16px",
                "grid-gap: 8px",
                "align-items: center",
                "justify-items: center",
                "word-wrap: break-word",
                "-webkit-user-select: none",
                'font-feature-settings: "tnum"',
                "font-size: max(12px, min(2vw, 20px))",
            ]),
        );
    });
});
