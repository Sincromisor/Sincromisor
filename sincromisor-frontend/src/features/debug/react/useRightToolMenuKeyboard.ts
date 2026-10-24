import { type KeyboardEvent, useLayoutEffect, useRef } from "react";
import { closeRightToolMenu, openRightToolMenu } from "../../../app/react/useRightToolPanelState";

function menuItems(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>('#debugMenuPanel [role="menuitem"]')];
}

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

/** 標準のメニューボタン操作を実装し、非表示になる項目を復帰先にしない。 */
export function useRightToolMenuKeyboard(menuOpen: boolean) {
    const focusLast = useRef(false);
    useLayoutEffect(() => {
        if (!menuOpen) return;
        // メニューのvisibility切り替えが反映されてから、見える項目へ移す。
        const frame = requestAnimationFrame(() => {
            const items = menuItems();
            items[focusLast.current ? items.length - 1 : 0]?.focus();
            focusLast.current = false;
        });
        return () => cancelAnimationFrame(frame);
    }, [menuOpen]);
    return (event: KeyboardEvent<HTMLElement>): void => {
        if (
            event.target instanceof HTMLElement &&
            event.target.id === "debugMenuButton" &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
        ) {
            event.preventDefault();
            focusLast.current = event.key === "ArrowUp";
            if (menuOpen) menuItems()[focusLast.current ? menuItems().length - 1 : 0]?.focus();
            else openRightToolMenu();
            return;
        }
        if (!menuOpen) return;
        const items = menuItems();
        const current = items.findIndex((item) => item === document.activeElement);
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeRightToolMenu();
            document.getElementById("debugMenuButton")?.focus();
        } else if (event.key === "Tab") {
            event.preventDefault();
            closeRightToolMenu();
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
