import { expect, type Locator } from "@playwright/test";

/** 色の差分だけでは見逃す枠と内容の整列を、実際の描画座標で比較する。 */
export async function expectSettingsAlignment(shell: Locator) {
    const layout = await shell.evaluate((element) => {
        const node = (selector: string) => {
            const found = element.querySelector<HTMLElement>(selector);
            if (!found) throw new Error(`配置確認の対象がありません: ${selector}`);
            return found;
        };
        const rect = (el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        const body = node(".settingsShell__detail");
        const scroll = node(".settingsShell__detailScroll");
        const footer = node(".settingsShell__footer");
        return {
            body: rect(body),
            footer: rect(footer),
            header: rect(node(".settingsShell__header")),
            contentLeft: scroll.firstElementChild?.getBoundingClientRect().left,
            actionLeft: footer.firstElementChild?.getBoundingClientRect().left,
            bodyRadius: getComputedStyle(body).borderRadius,
            footerRadius: getComputedStyle(footer).borderRadius,
            horizontalOverflow: [element, scroll, footer].some(
                (el) => el.scrollWidth > el.clientWidth + 1,
            ),
            outerOverflow: element.scrollHeight > element.clientHeight + 1,
            viewportHeight: window.innerHeight,
        };
    });
    for (const edge of ["left", "right"] as const) {
        expect(Math.abs(layout.body[edge] - layout.footer[edge]), edge).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.body[edge] - layout.header[edge]), edge).toBeLessThanOrEqual(1);
    }
    expect(layout.contentLeft).toBeDefined();
    expect(layout.actionLeft).toBeDefined();
    expect(Math.abs((layout.contentLeft ?? 0) - (layout.actionLeft ?? 0))).toBeLessThanOrEqual(1);
    expect(layout.bodyRadius).toBe(layout.footerRadius);
    expect(layout.horizontalOverflow).toBe(false);
    expect(layout.outerOverflow).toBe(false);
    expect(layout.body.bottom).toBeLessThanOrEqual(layout.footer.top);
    expect(layout.footer.bottom).toBeLessThanOrEqual(layout.viewportHeight);
    return layout;
}

/** 開始理由の有無にかかわらず、広幅の操作行と狭幅の縦並びを確認する。 */
export async function expectStartupActions(shell: Locator) {
    const toggle = shell.locator("[data-startup-view-toggle]");
    const start = shell.locator(".configurationDialogReactSettingsPanel__startButton");
    const a = await toggle.boundingBox();
    const b = await start.boundingBox();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    if (!a || !b) throw new Error("開始操作が表示されていません");
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    const width = await shell.evaluate((el) => el.getBoundingClientRect().width);
    if (width > 480) expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
    else {
        expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1);
        expect(a.y + a.height).toBeLessThan(b.y);
    }
    await expect(
        shell.locator(".settingsShell__header").getByRole("link", { name: "トップへ戻る" }),
    ).toHaveAttribute("href", "/");
    const hint = shell.locator(".configurationDialogReactSettingsPanel__hintText");
    if (await hint.isVisible()) {
        await expect(start).toHaveAttribute(
            "aria-describedby",
            (await hint.getAttribute("id")) ?? "",
        );
        const h = await hint.boundingBox();
        expect(h?.y).toBeGreaterThanOrEqual(b.y + b.height);
    }
}

export async function selectSettingsCategory(shell: Locator, id: string) {
    const select = shell.locator(".settingsShell__navSelect");
    if (await select.isVisible()) await select.selectOption(id);
    else await shell.locator(`[role="tab"][aria-controls$="-${id}"]`).click();
    await expect(shell.locator(`[role="tabpanel"][id$="-${id}"]`)).toBeVisible();
}
