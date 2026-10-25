import { expect, type Page, test } from "@playwright/test";

// OBSのOnLoadEndと同じhead末尾への追加に加え、先頭への挿入でも優先順位を確認する。
async function insertCss(page: Page, css: string, position: "prepend" | "append") {
    await page.evaluate(
        ({ css, position }) => {
            document.getElementById("test-obs-css")?.remove();
            const style = document.createElement("style");
            style.id = "test-obs-css";
            style.textContent = css;
            document.head[position](style);
        },
        { css, position },
    );
}

for (const route of ["simple-vrm", "vrm360", "looking-glass-vrm"]) {
    for (const width of [1440, 320]) {
        test(`${route}の${width}px幅で追加CSSから設定画面の通常指定を守る`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`/${route}/`);
            const dialog = page.getByRole("dialog");
            await expect(dialog).toBeVisible();
            await page.evaluate(() => document.fonts.ready);
            const box = await dialog.boundingBox();
            expect(box).toMatchObject({ x: width === 320 ? 12 : 160, height: 820 });
            await expect(dialog).toHaveCSS("border-top-color", "rgb(53, 65, 81)");

            for (const position of ["prepend", "append"] as const) {
                // OBS既定CSSの背景・余白・スクロール指定は、設定画面の操作を壊さない。
                await insertCss(
                    page,
                    "body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }",
                    position,
                );
                expect(await dialog.boundingBox()).toEqual(box);
                await page.getByRole("button", { name: "詳しい設定", exact: true }).click();
                await page.getByRole("button", { name: "開始画面へ戻る", exact: true }).click();

                await insertCss(
                    page,
                    "dialog { border-color: rgb(1, 2, 3); width: 10px; }",
                    position,
                );
                await expect(dialog).toHaveCSS("border-top-color", "rgb(53, 65, 81)");
                expect(await dialog.boundingBox()).toEqual(box);

                // 意図した上書きは禁止せず、!importantによる明示指定は引き続き反映する。
                await insertCss(
                    page,
                    "dialog { border-color: rgb(1, 2, 3) !important; }",
                    position,
                );
                await expect(dialog).toHaveCSS("border-top-color", "rgb(1, 2, 3)");
                await page.evaluate(() => document.getElementById("test-obs-css")?.remove());
                await expect(dialog).toHaveCSS("border-top-color", "rgb(53, 65, 81)");
            }
        });
    }
}
