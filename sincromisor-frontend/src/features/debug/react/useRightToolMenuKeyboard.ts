import { type KeyboardEvent, useLayoutEffect } from "react";

// 起動前などで無効な体験操作は、矢印キーの移動先からも除く。
function menuItems(): HTMLButtonElement[] {
    return [
        ...document.querySelectorAll<HTMLButtonElement>(
            '#debugMenuPanel [role="menuitem"]:not(:disabled)',
        ),
    ];
}

// 非モーダルのメニューから、起点の前後にある見える操作へTabで離脱する。
function focusOutsideMenu(backward: boolean): void {
    const candidates = [
        ...document.querySelectorAll<HTMLElement>(
            "button, a[href], input, select, textarea, [tabindex]",
        ),
    ].filter(
        (node) =>
            node.tabIndex >= 0 &&
            !node.matches(":disabled") &&
            !node.closest("[inert], #debugMenuPanel") &&
            node.getClientRects().length > 0 &&
            getComputedStyle(node).visibility !== "hidden",
    );
    const current = candidates.findIndex((node) => node.id === "debugMenuButton");
    const next = candidates[current + (backward ? -1 : 1)];
    (next ?? document.getElementById("debugMenuButton"))?.focus();
}

/** Popoverが提供しない項目移動とTab離脱を補い、Escapeと復帰先は標準動作へ委ねる。 */
export function useRightToolMenuKeyboard(menuOpen: boolean) {
    useLayoutEffect(() => {
        if (!menuOpen) return;
        // toggle通知前のキー入力で移動済みなら、その操作結果を上書きしない。
        if (document.activeElement?.closest("#debugMenuPanel")) return;
        menuItems()[0]?.focus();
    }, [menuOpen]);
    return (event: KeyboardEvent<HTMLElement>): void => {
        // ネイティブの開閉と非同期toggle通知の間にもキー操作を受け付ける。
        const panel = document.getElementById("debugMenuPanel");
        const isOpen = panel?.matches(":popover-open");
        if (
            event.target instanceof HTMLElement &&
            event.target.id === "debugMenuButton" &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
        ) {
            event.preventDefault();
            if (!isOpen) panel?.showPopover({ source: event.target });
            const items = menuItems();
            items[event.key === "ArrowUp" ? items.length - 1 : 0]?.focus();
            return;
        }
        if (!isOpen) return;
        const items = menuItems();
        const current = items.findIndex((item) => item === document.activeElement);
        if (event.key === "Tab") {
            event.preventDefault();
            panel?.hidePopover();
            focusOutsideMenu(event.shiftKey);
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next =
                event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                        items.length;
            items[next]?.focus();
        }
    };
}
